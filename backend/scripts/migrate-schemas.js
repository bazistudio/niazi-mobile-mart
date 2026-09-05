const mongoose = require('mongoose');
require('dotenv').config();

async function runMigration() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.');

        // 1. MIGRATION: Expense Categories to Lowercase
        console.log('\n--- Migrating Expense Categories ---');
        const Expense = mongoose.connection.collection('expenses');
        
        const categoryMap = {
            'Rent': 'rent',
            'Salary': 'salary',
            'Salaries': 'salary',
            'Utilities': 'utilities',
            'Transport': 'transport',
            'Purchase': 'purchase',
            'Purchases': 'purchase',
            'Repair': 'repair',
            'Other': 'other'
        };

        let expenseUpdates = 0;
        for (const [oldVal, newVal] of Object.entries(categoryMap)) {
            const result = await Expense.updateMany(
                { category: oldVal },
                { $set: { category: newVal } }
            );
            if (result.modifiedCount > 0) {
                console.log(`Updated ${result.modifiedCount} expenses from '${oldVal}' to '${newVal}'`);
                expenseUpdates += result.modifiedCount;
            }
        }
        console.log(`Total Expense categories migrated: ${expenseUpdates}`);

        // 2. MIGRATION: Payment Status 'success' to 'confirmed'
        console.log('\n--- Migrating Payment Status ---');
        const Payment = mongoose.connection.collection('payments');
        const paymentResult = await Payment.updateMany(
            { status: 'success' },
            { $set: { status: 'confirmed' } }
        );
        console.log(`Updated ${paymentResult.modifiedCount} payments from 'success' to 'confirmed'`);

        // 3. MIGRATION: LedgerEntry runningBalance
        console.log('\n--- Migrating LedgerEntry runningBalance ---');
        const LedgerEntry = mongoose.connection.collection('ledgerentries');
        const ledgerResult = await LedgerEntry.updateMany(
            { runningBalance: { $exists: false } },
            { $set: { runningBalance: 0 } }
        );
        console.log(`Backfilled runningBalance with 0 for ${ledgerResult.modifiedCount} ledger entries`);

        console.log('\n✅ All migrations completed successfully.');
        process.exit(0);

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
