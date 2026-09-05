const jwt = require("jsonwebtoken");
const UserSession = require("../models/UserSession");
const cacheService = require("../services/cacheService");
const crypto = require("crypto");
const { tenantContext } = require('./context/asyncContext');

module.exports = async (req, res, next) => {
  try {
    req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
    
    let token = null;
    const header = req.headers.authorization;

    if (header && header.startsWith("Bearer ")) {
      token = header.split(" ")[1];
    } else if (req.cookies && req.cookies.tp_token) {
      token = req.cookies.tp_token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized: no token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // We expect { userId, sessionId, tokenVersion }
    const { userId, sessionId, tokenVersion } = decoded;

    if (!userId || !sessionId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid token payload" });
    }

    // Load session via CacheService
    const sessionKey = `session:${sessionId}`;
    const session = await cacheService.remember(sessionKey, 300, async () => {
      return await UserSession.findById(sessionId).lean();
    });

    if (!session || session.status !== 'ACTIVE') {
      return res.status(401).json({ success: false, message: "Unauthorized: Session is inactive or revoked" });
    }

    if (session.tokenVersion !== tokenVersion) {
      return res.status(401).json({ success: false, message: "Unauthorized: Token version mismatch (revoked)" });
    }
    
    // Periodically update lastActivity (e.g. 1% chance to save DB write, or every X mins via worker)
    // For now, we will fire and forget an update to DB if it's older than 5 mins
    const now = Date.now();
    if (now - new Date(session.lastActivity).getTime() > 5 * 60 * 1000) {
      UserSession.findByIdAndUpdate(sessionId, { lastActivity: new Date() }).exec().catch(console.error);
    }

    const { runInSystemContext } = require('./context/asyncContext');
    const User = require('../models/User');
    const user = await cacheService.remember(`user:${userId}`, 300, async () => {
      return await runInSystemContext(async () => {
        return await User.findById(userId).lean();
      });
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized: User not found" });
    }

    req.user = {
      ...user, // include role, tenantId, organizationId, etc.
      _id: userId,
      userId: userId,
      sessionId: sessionId
    };

    req.organizationId = session.activeOrganizationId || user.organizationId || user.tenantId;
    req.branchId = session.activeBranchId || session.activeShopId || (user.branchAccess && user.branchAccess.length > 0 ? user.branchAccess[0] : null) || user.shopId || req.organizationId;
    req.shopId = req.branchId; // Fallback for legacy controllers

    // Back-populate into req.user for legacy controllers
    req.user.branchId = req.branchId;
    req.user.shopId = req.shopId;
    req.user.tenantId = req.organizationId;

    if (req.organizationId) {
      const Organization = require('../models/Organization');
      const org = await cacheService.remember(`org:${req.organizationId}`, 300, async () => {
        return await runInSystemContext(async () => {
          return await Organization.findById(req.organizationId).lean();
        });
      });
      if (org) {
        req.accountType = org.accountType;
        req.user.accountType = org.accountType;
      }
    }

    const store = {
      organizationId: req.organizationId || null,
      shopId: req.shopId || null,
      userId: userId,
      sessionId: sessionId,
      requestId: req.requestId
    };

    tenantContext.run(store, () => {
      next();
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired", expired: true });
    }
    console.error("Auth Middleware Error:", error);
    return res.status(401).json({ success: false, message: "Unauthorized: invalid token" });
  }
};