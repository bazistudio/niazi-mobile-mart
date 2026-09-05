const mongoose = require('mongoose');
const { connectDB } = require('../db');
const LedgerEntry = require('../models/LedgerEntry');
const Customer = require('../models/Customer');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const APPLY_FIXES = args.includes('--apply-fixes');

async function rebuildLedger() {
  console.log('🏗️ Starting Ledger Rebuild Engine...');
  console.log(`Mode: ${APPLY_FIXES ? '🚨 APPLY-FIXES (OVERWRITING DB)' : '🛡️ SAFE (CSV ONLY)'}`);

  try {
    await connectDB();
    
    // 1. Compute truth from Ledger
    const aggregatedBalances = await LedgerEntry.aggregate([
      { $match: { customerId: { $exists: true }, status: 'active' } },
      {
        $group: {
          _id: '$customerId',
          totalDebit: { $sum: { $cond: [{ $eq: ['$debitAccount', 'receivable'] }, '$amount', 0] } },
          totalCredit: { $sum: { $cond: [{ $eq: ['$creditAccount', 'receivable'] }, '$amount', 0] } }
        }
      },
      {
        $project: {
          trueBalance: { $subtract: ['$totalDebit', '$totalCredit'] }
        }
      }
    ]);

    const csvRows = ['CustomerId,CachedBalance,TrueBalance,Difference,Action'];
    let discrepancies = 0;

    for (const record of aggregatedBalances) {
      const customer = await Customer.findById(record._id);
      if (!customer) continue;

      const drift = Math.abs(customer.currentBalance - record.trueBalance);

      if (drift > 0.01) {
        discrepancies++;
        csvRows.push(`${customer._id},${customer.currentBalance},${record.trueBalance},${customer.currentBalance - record.trueBalance},Needs_Fix`);
        
        if (APPLY_FIXES) {
          // Log the manual override as a systemic ledger event
          await LedgerEntry.create({
            transactionId: `REBUILD-${Date.now()}`,
            type: 'correction',
            debitAccount: 'receivable', // Assuming standard direction for correction logging
            creditAccount: 'receivable',
            amount: 0,
            customerId: customer._id,
            status: 'active',
            shopId: customer.shopId,
            tenantId: customer.tenantId,
            description: `Manual Rebuild Overwrite. Prev: ${customer.currentBalance}, New: ${record.trueBalance}`
          });

          // Overwrite the cache
          customer.currentBalance = record.trueBalance;
          await customer.save();
          console.log(`Applied fix for customer ${customer._id}`);
        }
      } else {
        csvRows.push(`${customer._id},${customer.currentBalance},${record.trueBalance},0,OK`);
      }
    }

    // Write CSV
    const csvPath = path.join(__dirname, 'ledger_rebuild_report.csv');
    fs.writeFileSync(csvPath, csvRows.join('\n'));
    console.log(`\n📄 Report generated at ${csvPath}`);
    console.log(`Total Accounts Evaluated: ${aggregatedBalances.length}`);
    console.log(`Discrepancies Found: ${discrepancies}`);

  } catch (error) {
    console.error('❌ Rebuild Engine Failed:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

rebuildLedger();
