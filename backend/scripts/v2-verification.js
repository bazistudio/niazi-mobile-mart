const mongoose = require('mongoose');
require('dotenv').config();

async function runVerification() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.\n');

        console.log('=== V2 PRE-DEPLOYMENT VERIFICATION ===\n');

        // 1. Check Payment Document
        const Payment = mongoose.connection.collection('payments');
        const payment = await Payment.findOne({}, { sort: { _id: -1 } });
        
        if (!payment) {
            console.log('Payment Document: No payments found in DB. Safe to proceed.');
        } else {
            console.log('Latest Payment Document Status:');
            console.log(`- ID: ${payment._id}`);
            console.log(`- Status: "${payment.status}"`);
            
            if (payment.status === 'confirmed') {
                console.log('✅ Good: Payment status is V2 compliant ("confirmed").');
            } else if (payment.status === 'success') {
                console.log('⚠️ WARNING: Payment status is "success". Migration IS required before deployment!');
            } else {
                console.log(`ℹ️ Info: Payment status is "${payment.status}".`);
            }
        }

        console.log('\n----------------------------------------\n');

        // 2. Check Ledger Entry runningBalance
        const LedgerEntry = mongoose.connection.collection('ledgerentries');
        const ledger = await LedgerEntry.findOne({}, { sort: { _id: -1 } });
        
        if (!ledger) {
            console.log('LedgerEntry Document: No ledger entries found in DB. Safe to proceed.');
        } else {
            console.log('Latest LedgerEntry Document:');
            console.log(`- ID: ${ledger._id}`);
            console.log(`- Type: ${ledger.type}`);
            
            if (ledger.runningBalance !== undefined && ledger.runningBalance !== null) {
                console.log(`✅ Good: runningBalance exists (${ledger.runningBalance}). V2 compliant.`);
            } else {
                console.log('⚠️ WARNING: runningBalance is missing! Legacy data detected. Migration IS required before deployment!');
            }
        }

        console.log('\n=== VERIFICATION COMPLETE ===\n');
        process.exit(0);
    } catch (err) {
        console.error('Verification script failed:', err);
        process.exit(1);
    }
}

runVerification();
