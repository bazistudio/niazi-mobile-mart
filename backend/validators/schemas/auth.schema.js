const { z } = require('zod');

exports.loginSchema = {
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters')
  })
};

exports.refreshTokenSchema = {
  body: z.object({
    // Usually via cookie, but could be body
    refreshToken: z.string().optional()
  })
};

exports.switchContextSchema = {
  body: z.object({
    organizationId: z.string().uuid('Invalid Organization ID').optional(),
    branchId: z.string().uuid('Invalid Branch ID').nullable().optional()
  })
};

exports.signupSchema = {
  body: z.object({
    ownerName: z.string().min(2, 'Owner name is required'),
    businessName: z.string().min(2, 'Business name is required'),
    email: z.string().email('Invalid email address'),
    mobile: z.string().min(5, 'Mobile number is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    accountType: z.enum(['SINGLE_SHOP', 'ORGANIZATION']).default('SINGLE_SHOP'),
    businessType: z.enum(['SYSTEM', 'RETAIL', 'MEDICAL', 'AUTO', 'WHOLESALE', 'RESTAURANT', 'SALON', 'MANUFACTURING']).default('RETAIL')
  })
};
