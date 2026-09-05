const { connectDB, getClient, startSession, withTransaction } = require('./connection');
const userHandler = require('./handlers/user.handler');
const orderHandler = require('./handlers/order.handler');
const inventoryHandler = require('./handlers/inventory.handler');
const transactionHandler = require('./handlers/transaction.handler');
const productHandler = require('./handlers/product.handler');
const customerHandler = require('./handlers/customer.handler');
const idempotencyHandler = require('./handlers/idempotency.handler');
const paymentHandler = require('./handlers/payment.handler');

module.exports = {
  connectDB,
  getClient,
  startSession,
  withTransaction,
  userHandler,
  orderHandler,
  inventoryHandler,
  transactionHandler,
  productHandler,
  customerHandler,
  idempotencyHandler,
  paymentHandler
};
