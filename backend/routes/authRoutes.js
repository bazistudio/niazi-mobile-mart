const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { loginSchema, refreshTokenSchema, switchContextSchema, signupSchema } = require('../validators/schemas/auth.schema');
const { loginLimiter, refreshLimiter, switchContextLimiter, apiLimiter } = require('../middleware/rateLimiter');

// Standard SaaS Auth Endpoints
router.post('/signup', apiLimiter, validateRequest(signupSchema), authController.signup);
router.post('/login', loginLimiter, validateRequest(loginSchema), authController.loginEmail);
router.post('/refresh', refreshLimiter, validateRequest(refreshTokenSchema), authController.refreshToken);
router.get('/me', authMiddleware, authController.me);
router.post('/logout', apiLimiter, authMiddleware, authController.logout);
router.post('/switch-context', authMiddleware, switchContextLimiter, validateRequest(switchContextSchema), authController.switchContext);

module.exports = router;
