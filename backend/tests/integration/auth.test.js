const request = require('supertest');
const app = require('../../server');
const mongoose = require('mongoose');
const User = require('../../models/User');
const UserSession = require('../../models/UserSession');
const Organization = require('../../models/Organization');
const OrganizationMember = require('../../models/OrganizationMember');
const Branch = require('../models/Branch');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

describe('Authentication & Context Integration', () => {
  let user, session, organization, shop, token;

  beforeEach(async () => {
    // 1. Create a user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);
    user = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: hashedPassword,
      status: 'active'
    });

    // 2. Create organization and shop
    organization = await Organization.create({
      name: 'Test Org',
      code: 'ORG-TEST',
      ownerId: user._id,
      currency: 'PKR'
    });

    await OrganizationMember.create({
      organizationId: organization._id,
      userId: user._id,
      role: 'OWNER',
      isSystemOwner: true,
      status: 'ACTIVE'
    });

    shop = await Branch.create({
      name: 'Test Branch',
      organizationId: organization._id,
      ownerId: user._id,
      email: 'shop@example.com',
      phone: '1234567890',
      ownerName: 'Test User'
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully and return standard api response', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user.email).toBe('test@example.com');
      
      // Verify session was created
      const activeSession = await UserSession.findOne({ userId: user._id, status: 'ACTIVE' });
      expect(activeSession).not.toBeNull();
    });

    it('should fail with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/switch-context', () => {
    beforeEach(async () => {
      // Login first
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      token = loginRes.body.data.token;
    });

    it('should switch context successfully', async () => {
      const res = await request(app)
        .post('/api/auth/switch-context')
        .set('Authorization', `Bearer ${token}`)
        .send({
          organizationId: organization._id.toString(),
          shopId: shop._id.toString()
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Context switched successfully');

      // Verify DB update
      const activeSession = await UserSession.findOne({ userId: user._id, status: 'ACTIVE' });
      expect(activeSession.activeOrganizationId.toString()).toBe(organization._id.toString());
      expect(activeSession.activeShopId.toString()).toBe(shop._id.toString());
    });

    it('should fail to switch to an organization the user does not belong to', async () => {
      const otherOrg = await Organization.create({
        name: 'Other Org',
        code: 'ORG-OTHER',
        ownerId: crypto.randomUUID()
      });

      const res = await request(app)
        .post('/api/auth/switch-context')
        .set('Authorization', `Bearer ${token}`)
        .send({
          organizationId: otherOrg._id.toString()
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    beforeEach(async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      token = loginRes.body.data.token;
    });

    it('should logout and invalidate session', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const activeSession = await UserSession.findOne({ userId: user._id, status: 'ACTIVE' });
      expect(activeSession).toBeNull();
    });
  });
});
