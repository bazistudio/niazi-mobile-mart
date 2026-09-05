const crypto = require("crypto");
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const authService = require('../services/auth/authService');
const emailStrategy = require('../services/auth/emailStrategy');
const pinStrategy = require('../services/auth/pinStrategy');

authService.registerStrategy('EMAIL', emailStrategy);
authService.registerStrategy('PIN', pinStrategy);

const Organization = require('../models/Organization');
const User = require('../models/User');
const UserSession = require('../models/UserSession');
const AuditLog = require('../models/AuditLog'); // Assuming it exists, but might fail silently

process.env.JWT_SECRET = 'testsecret';

async function verify() {
  console.log('Connecting to Test Database...');
  await mongoose.connect('mongodb://127.0.0.1:27017/tijaratpro_phase2_test');
  await mongoose.connection.dropDatabase();
  console.log('✅ Database connected and cleared.');

  console.log('\n--- Setting up data ---');
  const org1 = new Organization({ name: 'Org 1', code: 'MM2', ownerId: crypto.randomUUID(), industryType: 'RETAIL' });
  await org1.save();

  const org2 = new Organization({ name: 'Org 2', code: 'NIAZI', ownerId: crypto.randomUUID(), industryType: 'RETAIL' });
  await org2.save();

  const passwordHash = await bcrypt.hash('password123', 10);
  const pinHash = await bcrypt.hash('1234', 10);

  const admin = new User({ 
    name: 'Admin', email: 'admin@mm2.com', passwordHash,
    organizationId: org1._id, roleId: crypto.randomUUID()
  });
  await admin.save();

  const cashier = new User({
    name: 'Cashier', username: 'cashier1', pinHash, pinEnabled: true,
    organizationId: org1._id, roleId: crypto.randomUUID()
  });
  await cashier.save();

  const otherCashier = new User({
    name: 'Cashier 2', username: 'cashier1', pinHash, pinEnabled: true,
    organizationId: org2._id, roleId: crypto.randomUUID()
  });
  await otherCashier.save();

  console.log('✅ Data setup complete.');

  try {
    console.log('\n--- Testing Email Login ---');
    const emailRes = await authService.login('EMAIL', { email: 'admin@mm2.com', password: 'password123' }, { ipAddress: '127.0.0.1' });
    if (!emailRes.token || !emailRes.refreshToken) throw new Error('Email login failed');
    console.log('✅ Email login successful');

    console.log('\n--- Testing PIN Login ---');
    const pinRes = await authService.login('PIN', { organizationCode: 'MM2', username: 'cashier1', pin: '1234' }, { ipAddress: '127.0.0.1' });
    if (!pinRes.token || pinRes.user.username !== 'cashier1') throw new Error('PIN login failed');
    console.log('✅ PIN login successful');

    console.log('\n--- Testing Wrong PIN ---');
    try {
      await authService.login('PIN', { organizationCode: 'MM2', username: 'cashier1', pin: '0000' }, {});
      throw new Error('Should have failed');
    } catch(e) {
      if (e.message === 'Should have failed') throw e;
      console.log('✅ Wrong PIN rejected properly.');
    }

    console.log('\n--- Testing Lockout (5 failures) ---');
    for(let i=0; i<4; i++) {
      try { await authService.login('PIN', { organizationCode: 'MM2', username: 'cashier1', pin: '0000' }, {}); } catch(e){}
    }
    // Now locked
    const lockedUser = await User.findById(cashier._id);
    if (!lockedUser.lockedUntil) throw new Error('User not locked after 5 attempts');
    console.log('✅ Account locked after 5 failed attempts.');

    try {
      await authService.login('PIN', { organizationCode: 'MM2', username: 'cashier1', pin: '1234' }, {}); // Correct pin
      throw new Error('Should be locked');
    } catch(e) {
      if (!e.message.includes('Account locked')) throw e;
      console.log('✅ Login rejected because account is locked.');
    }

    console.log('\n--- Testing Sessions & Revocation ---');
    const sessions = await UserSession.find({ userId: admin._id });
    if (sessions.length !== 1) throw new Error('Session not created');
    
    // Revoke it
    sessions[0].isRevoked = true;
    await sessions[0].save();
    console.log('✅ Session revoked.');

    console.log('\n--- Testing Organization Isolation ---');
    const org2Res = await authService.login('PIN', { organizationCode: 'NIAZI', username: 'cashier1', pin: '1234' }, {});
    if (org2Res.user.organizationId.toString() !== org2._id.toString()) throw new Error('Isolation failed');
    console.log('✅ MM2 and NIAZI cashiers safely isolated.');

    console.log('\n✅ All Phase 2 Verifications Passed Successfully!');
    process.exit(0);

  } catch(e) {
    console.error('❌ Verification Failed:', e);
    process.exit(1);
  }
}

verify();
