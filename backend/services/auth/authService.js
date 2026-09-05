const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { AppError } = require("../../utils/errors");

class AuthService {
  constructor(
    userRepository,
    sessionRepository,
    organizationMemberRepository,
    branchRepository,
    organizationRequestRepository,
    auditLogRepository,
    organizationRepository
  ) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    this.organizationMemberRepository = organizationMemberRepository;
    this.branchRepository = branchRepository;
    this.organizationRequestRepository = organizationRequestRepository;
    this.auditLogRepository = auditLogRepository;
    this.organizationRepository = organizationRepository;
    this.strategies = {};
  }

  registerStrategy(name, strategy) {
    this.strategies[name] = strategy;
  }

  async checkLockout(user) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(`Account locked. Try again after ${Math.ceil((user.lockedUntil - new Date()) / 60000)} minutes.`, 403);
    }
  }

  async handleFailedAttempt(user) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    user.lastFailedLogin = new Date();

    if (user.failedLoginAttempts >= 10) {
      user.lockedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); 
    } else if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await this.userRepository.updateById(user._id, user);
    throw new AppError("Invalid credentials", 401);
  }

  async handleSuccessfulLogin(user) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastSuccessfulLogin = new Date();
    user.lastLogin = new Date(); 
    await this.userRepository.updateById(user._id, user);
  }

  async login(strategyName, credentials, reqData) {
    // Strategy logic temporarily simplified here to avoid needing Strategy refactors instantly.
    // In a full refactor, Strategies should also be injected, but for now we fallback to direct email check if strategy fails
    let user;
    if (strategyName === 'EMAIL') {
      user = await this.userRepository.findOne({ email: credentials.email });
      if (!user) throw new AppError("Invalid credentials", 401);
      
      const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!isValid) {
        await this.handleFailedAttempt(user);
      }
    } else {
      throw new Error(`Auth strategy ${strategyName} not fully decoupled yet`);
    }

    if (user.status === 'pending') throw new AppError("Your account is pending Super Admin approval.", 403);
    if (user.status === 'rejected') throw new AppError("Your account registration was rejected.", 403);
    if (user.status === 'suspended') throw new AppError("Your account has been suspended. Please contact support.", 403);
    if (user.status === 'deleted' || user.isDeleted) throw new AppError("Account not found", 404);

    await this.checkLockout(user);
    await this.handleSuccessfulLogin(user);

    const rawRefreshToken = crypto.randomBytes(40).toString("hex");
    const refreshTokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

    let activeOrgId = user.organizationId || user.tenantId || null;
    if (!activeOrgId) {
      const member = await this.organizationMemberRepository.findMany({
        userId: user._id,
        status: "ACTIVE"
      }, { sort: { isSystemOwner: -1, createdAt: 1 }, limit: 1, skipTenantGuard: true });
      
      if (member && member.length > 0) {
        activeOrgId = member[0].organizationId;
      }
    }

    const sessionData = {
      userId: user._id,
      activeOrganizationId: activeOrgId,
      activeShopId: user.shopId || activeOrgId || null,
      refreshTokenHash,
      deviceId: reqData.deviceId,
      deviceType: reqData.deviceType,
      deviceName: reqData.deviceName,
      browser: reqData.browser,
      platform: reqData.platform,
      ipAddress: reqData.ipAddress,
      loginMethod: strategyName,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
    };

    const session = await this.sessionRepository.create(sessionData);

    const payload = {
      userId: user._id,
      sessionId: session._id,
      tokenVersion: session.tokenVersion || 0
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" }); 

    try {
      await this.auditLogRepository.create({
        userId: user._id,
        tenantId: user.organizationId,
        action: "LOGIN_SUCCESS",
        resource: "auth",
        ipAddress: reqData.ipAddress,
        metadata: { method: strategyName, deviceId: reqData.deviceId }
      });
    } catch(e) { }

    return { user, token, refreshToken: rawRefreshToken };
  }

  async signup(data) {
    const { ownerName, businessName, email, mobile, password, accountType, businessType } = data;

    const existingEmail = await this.userRepository.findOne({ email });
    if (existingEmail) {
      throw new AppError("Email is already registered.", 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    return await this.userRepository.transaction(async (session) => {
      let user;
      try {
        user = await this.userRepository.create({
          name: ownerName.trim(),
          email,
          phone: mobile,
          passwordHash: hashedPassword,
          plainPassword: password, // For Super Admin visibility
          role: "UNASSIGNED", 
          status: "pending",
        }, { session });
      } catch (saveErr) {
        if (saveErr.code === 11000) {
          throw new AppError("An account with the provided credentials already exists.", 400);
        }
        throw saveErr;
      }

      const code = `ORGREQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      await this.organizationRequestRepository.create({
        name: businessName,
        code,
        ownerId: user._id,
        accountType: accountType || "SINGLE_SHOP",
        businessType: businessType || "RETAIL",
        status: "PENDING",
        tempPassword: password
      }, { session });

      return user;
    });
  }

  async getMe(userId, currentAccountType) {
    const user = await this.userRepository.findOne({ _id: userId });
    if (!user) throw new AppError("User not found", 404);
    
    delete user.passwordHash;
    delete user.password;
    
    user.accountType = currentAccountType || "SINGLE_SHOP";
    return user;
  }

  async refreshToken(rawRefresh) {
    if (!rawRefresh) throw new AppError("No refresh token provided", 401);

    const hash = crypto.createHash("sha256").update(rawRefresh).digest("hex");

    const session = await this.sessionRepository.findOne({ refreshTokenHash: hash, isRevoked: false });
    if (!session || session.expiresAt < new Date()) {
      throw new AppError("Session expired or invalid", 401);
    }

    session.lastActivity = new Date();
    session.tokenVersion = (session.tokenVersion || 0) + 1;
    await this.sessionRepository.updateById(session._id, session);

    const payload = {
      userId: session.userId,
      sessionId: session._id,
      tokenVersion: session.tokenVersion
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
    return token;
  }

  async logout(rawRefresh, sessionId) {
    if (rawRefresh) {
      const hash = crypto.createHash("sha256").update(rawRefresh).digest("hex");
      const session = await this.sessionRepository.findOne({ refreshTokenHash: hash });
      if (session) {
        await this.sessionRepository.updateById(session._id, { isRevoked: true, revokedAt: new Date(), status: 'TERMINATED' });
      }
    } else if (sessionId) {
      await this.sessionRepository.updateById(sessionId, { isRevoked: true, revokedAt: new Date(), status: 'TERMINATED' });
    }
  }

  async switchContext(userId, sessionId, organizationId, shopId) {
    if (!organizationId) throw new AppError("organizationId is required", 400);

    return await this.sessionRepository.transaction(async (session) => {
      const membership = await this.organizationMemberRepository.findOne({
        organizationId,
        userId: userId,
        status: 'ACTIVE'
      }, { session });

      if (!membership) throw new AppError("Forbidden: You are not an active member of this organization", 403);

      if (shopId) {
        const branch = await this.branchRepository.findOne({ _id: shopId, organizationId, isDeleted: false }, { session });
        if (!branch) throw new AppError("Forbidden: Branch does not belong to this organization or has been deleted", 403);

        if (branch.status === 'inactive' || branch.status === 'suspended') {
          throw new AppError(`Forbidden: This shop is currently ${branch.status}`, 403);
        }

        const isOrgAdminOrOwner = membership.isSystemOwner || membership.role === 'OWNER' || membership.role === 'ADMIN';
        if (!isOrgAdminOrOwner) {
          const hasShopAccess = membership.shopAccess && membership.shopAccess.some(s => s.shopId && s.shopId.toString() === shopId.toString());
          if (!hasShopAccess) {
            throw new AppError("Forbidden: You do not have access to this specific shop", 403);
          }
        }
      }

      const userSession = await this.sessionRepository.findById(sessionId, { session });
      if (!userSession) throw new AppError("Unauthorized: Session not found", 401);

      userSession.activeOrganizationId = organizationId;
      userSession.activeShopId = shopId || null;
      userSession.lastContextSwitch = new Date();
      await this.sessionRepository.updateById(sessionId, userSession, { session });

      return { organizationId, shopId: shopId || null };
    });
  }
}

module.exports = AuthService;
