const { authService } = require("../container");
const asyncHandler = require("../utils/asyncHandler");
const { successResponse } = require("../utils/apiResponse");

function getRequestData(req) {
  return {
    deviceId: req.headers["x-device-id"] || "unknown",
    deviceName: req.headers["x-device-name"],
    browser: req.headers["user-agent"],
    ipAddress: req.ip || req.connection?.remoteAddress,
  };
}

exports.signup = asyncHandler(async (req, res) => {
  await authService.signup(req.body);
  
  return successResponse(
    res, 
    null, 
    "Your registration request has been submitted successfully.\n\nYour account is currently pending Super Admin approval.\n\nYou will be able to sign in after your request has been approved.", 
    201
  );
});

exports.loginEmail = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  const result = await authService.login("EMAIL", { email, password }, getRequestData(req));
  
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };

  res.cookie("tp_token", result.token, cookieOptions);
  res.cookie("tp_refresh", result.refreshToken, cookieOptions);
  
  let accountType = "SINGLE_SHOP";
  if (result.user.organizationId || result.user.tenantId) {
    const orgId = result.user.organizationId || result.user.tenantId;
    const { runInSystemContext } = require('../middleware/context/asyncContext');
    await runInSystemContext(async () => {
      let Organization;
      try { Organization = require('../models/Organization'); } catch (e) {}
      if (Organization) {
        const org = await Organization.findById(orgId).lean();
        if (org && org.accountType) {
          accountType = org.accountType;
        }
      }
    });
  }

  const userPayload = { 
    id: result.user._id, 
    name: result.user.name,
    email: result.user.email, 
    roleId: result.user.roleId,
    role: result.user.role,
    status: result.user.status,
    accountType 
  };

  return successResponse(res, { 
    user: userPayload, 
    token: result.token, 
    expiresIn: 604800, 
    session: { 
      // Handled by switchContext primarily, returning null for fresh logins
      organizationId: null, 
      shopId: null 
    } 
  }, "Login successful");
});

exports.me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user._id, req.user.accountType);
  return successResponse(res, user, "User fetched successfully");
});

exports.refreshToken = asyncHandler(async (req, res) => {
  const rawRefresh = req.cookies.tp_refresh || req.body.refreshToken;
  
  const token = await authService.refreshToken(rawRefresh);
  
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };
  res.cookie("tp_token", token, cookieOptions);

  return successResponse(res, { token }, "Token refreshed successfully");
});

exports.logout = asyncHandler(async (req, res) => {
  const rawRefresh = req.cookies.tp_refresh;
  
  await authService.logout(rawRefresh, req.user?.sessionId);

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };

  res.clearCookie("tp_token", cookieOptions);
  res.clearCookie("tp_refresh", cookieOptions);
  
  return successResponse(res, null, "Logged out successfully");
});

exports.switchContext = asyncHandler(async (req, res) => {
  const { organizationId, shopId } = req.body;

  const context = await authService.switchContext(req.user._id, req.user.sessionId, organizationId, shopId);

  // Note: Caching invalidation should ideally be in the service or an event listener,
  // but we decoupled it.

  return successResponse(res, { context }, "Context switched successfully");
});