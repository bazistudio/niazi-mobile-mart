const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const Branch = require('../models/Branch');
const pdfService = require('./pdfService');

/**
 * Generate an invoice from an Order
 * @param {string} orderId - The Order ID
 * @param {Object} session - Mongoose session
 */
exports.createInvoiceFromOrder = async (orderId, session = null) => {
  const order = await Order.findById(orderId)
    .populate('customerId')
    .session(session);

  if (!order) throw new Error('Order not found');

  // IDEMPOTENT WORKER GUARD: Prevent wasted processing if retried by BullMQ
  const existingInvoice = await Invoice.exists({ orderId: order._id, tenantId: order.tenantId }).session(session);
  if (existingInvoice) {
    return await Invoice.findById(existingInvoice._id).session(session);
  }

  const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const invoiceItems = order.items.map(item => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    total: item.price * item.quantity
  }));

  const subtotal = invoiceItems.reduce((acc, item) => acc + item.total, 0);
  const tax = subtotal * 0; // Logic for tax can be added here
  const grandTotal = subtotal + tax;

  const invoice = new Invoice({
    invoiceNumber,
    tenantId: order.tenantId,
    shopId: order.shopId,
    customerId: order.customerId?._id,
    orderId: order._id,
    items: invoiceItems,
    subtotal,
    tax,
    grandTotal,
    status: order.status === 'paid' || order.status === 'completed' ? 'paid' : 'pending',
    paymentMethod: order.paymentMethod,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  });

  try {
    if (session) {
      await invoice.save({ session });
    } else {
      await invoice.save();
    }
    return invoice;
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.orderId) {
      // Idempotency constraint hit: Invoice for this order already exists
      const existingInvoice = await Invoice.findOne({ orderId: order._id, tenantId: order.tenantId }).session(session);
      return existingInvoice;
    }
    throw error; // No silent failure for real errors
  }
};

/**
 * Get Invoice PDF Buffer
 * @param {string} invoiceId 
 * @param {string} tenantId 
 */
exports.getInvoicePDF = async (invoiceId, tenantId) => {
  const invoice = await Invoice.findOne({ _id: invoiceId, tenantId })
    .populate('customerId')
    .populate('orderId');

  if (!invoice) throw new Error('Invoice not found');

  // We need shop details for the header
  const shop = await Branch.findOne({ tenantId: invoice.tenantId }) || {};

  return await pdfService.generateInvoicePDF(invoice, shop);
};
