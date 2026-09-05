const mongoose = require('mongoose');
require('dotenv').config();

async function checkDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Check Expenses
        console.log('\n--- Expenses Category Enum Check ---');
        const Expense = mongoose.connection.collection('expenses');
        const expenseCategories = await Expense.aggregate([
            {
                $group: {
                    _id: "$category",
                    count: { $sum: 1 }
                }
            }
        ]).toArray();
        console.log(expenseCategories);

        // Check Payments
        console.log('\n--- Payments Status Enum Check ---');
        const Payment = mongoose.connection.collection('payments');
        const paymentStatuses = await Payment.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]).toArray();
        console.log(paymentStatuses);

        // Check Orders paymentStatus
        console.log('\n--- Orders Payment Status Enum Check ---');
        const Order = mongoose.connection.collection('orders');
        const orderPaymentStatuses = await Order.aggregate([
            {
                $group: {
                    _id: "$paymentStatus",
                    count: { $sum: 1 }
                }
            }
        ]).toArray();
        console.log(orderPaymentStatuses);

        // Check LedgerEntry runningBalance
        console.log('\n--- LedgerEntry runningBalance Check ---');
        const LedgerEntry = mongoose.connection.collection('ledgerentries');
        const missingRunningBalanceCount = await LedgerEntry.countDocuments({ runningBalance: { $exists: false } });
        console.log(`Ledger entries missing runningBalance: ${missingRunningBalanceCount}`);

        process.exit(0);
    } catch (err) {
        console.error('Error connecting or running aggregations:', err);
        process.exit(1);
    }
}

checkDatabase();
