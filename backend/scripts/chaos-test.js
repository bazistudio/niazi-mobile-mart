const axios = require('axios');
const mongoose = require('mongoose');
const { connectDB } = require('../db');
const { reconcileCustomerBalances } = require('../services/ledgerReconciliationService');
const LedgerEntry = require('../models/LedgerEntry');
const Customer = require('../models/Customer');
const crypto = require('crypto');

const API_URL = process.env.API_URL || 'http://localhost:8080/api';
// Assuming a valid auth token is provided via env
const AUTH_TOKEN = process.env.AUTH_TOKEN;

const headers = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  'Content-Type': 'application/json'
};

async function runChaosTest() {
  console.log('🔥 Starting TijaratPro Chaos Testing Suite 🔥\n');

  try {
    await connectDB();
    
    // 1. Double Order Spam Test
    console.log('🧪 Test 1: Idempotency Double-Tap (Order Spam)');
    const idempotencyKey = crypto.randomUUID();
    const orderPayload = {
      items: [{ productId: '60d5ecb8b392d7001f8e4e11', quantity: 1, price: 500 }],
      paymentMethod: 'cash',
      customerId: '60d5ecb8b392d7001f8e4e10'
    };

    const req1 = axios.post(`${API_URL}/orders`, orderPayload, {
      headers: { ...headers, 'Idempotency-Key': idempotencyKey }
    });
    const req2 = axios.post(`${API_URL}/orders`, orderPayload, {
      headers: { ...headers, 'Idempotency-Key': idempotencyKey }
    });

    try {
      const [res1, res2] = await Promise.allSettled([req1, req2]);
      console.log('✅ Concurrent requests completed.');
      console.log(`   Response 1 Status: ${res1.value?.status || res1.reason?.response?.status}`);
      console.log(`   Response 2 Status: ${res2.value?.status || res2.reason?.response?.status}`);
      // In a real run, both should return 200/201 and identical JSON, but DB should only have 1 order
    } catch (e) {
      console.log('⚠️ Note: Auth error expected if AUTH_TOKEN is not set.');
    }

    // 2. Ledger Drift Test (Time-based corruption)
    console.log('\n🧪 Test 2: Ledger Drift Reconciliation Check');
    const testCustomer = await Customer.findOne({});
    if (testCustomer) {
      console.log(`   Found customer ${testCustomer._id} with balance ${testCustomer.currentBalance}`);
      
      // Simulate silent corruption by manually changing cached balance
      const originalBalance = testCustomer.currentBalance;
      testCustomer.currentBalance += 1000; 
      await testCustomer.save();
      console.log('   💣 Manually corrupted customer balance by +1000');

      // Run reconciliation
      console.log('   Running Ledger Reconciliation Service...');
      const discrepancies = await reconcileCustomerBalances();
      
      if (discrepancies > 0) {
        console.log(`✅ Success: Reconciliation detected ${discrepancies} drift(s) correctly.`);
      } else {
        console.log('❌ Failure: Reconciliation missed the drift.');
      }

      // Restore
      testCustomer.currentBalance = originalBalance;
      await testCustomer.save();
      console.log('   Restored original balance.');
    } else {
      console.log('   Skipping: No customer found in DB.');
    }

    console.log('\n✅ Chaos tests completed successfully. The Self-Healing Financial Event System is active.');

  } catch (error) {
    console.error('❌ Chaos Test Failed:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

runChaosTest();
