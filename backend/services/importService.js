const XLSX = require('xlsx');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Expense = require('../models/Expense');

/**
 * Parse Excel Buffer and map columns to ERP fields
 * @param {Buffer} buffer - File buffer
 * @param {Object} mapping - User-provided mapping { 'Excel Column': 'erpField' }
 */
exports.parseAndMap = (buffer, mapping) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

  // Transform raw data based on mapping
  return rawData.map(row => {
    const mappedRow = {};
    Object.entries(mapping).forEach(([excelCol, erpField]) => {
      mappedRow[erpField] = row[excelCol];
    });
    return mappedRow;
  });
};

/**
 * Validate mapped data before final insertion
 * @param {Array} data - Mapped data array
 * @param {string} type - 'products' | 'customers' | 'expenses'
 */
exports.validateImportData = (data, type) => {
  const errors = [];
  const validData = data.filter((row, index) => {
    let isValid = true;
    
    if (type === 'products') {
      if (!row.name || !row.price) {
        errors.push({ line: index + 1, error: 'Name and Price are required' });
        isValid = false;
      }
    } else if (type === 'customers') {
      if (!row.name || !row.phone) {
        errors.push({ line: index + 1, error: 'Name and Phone are required' });
        isValid = false;
      }
    }

    return isValid;
  });

  return { validData, errors };
};

/**
 * Bulk Insert Products
 */
exports.importProducts = async (data, tenantId, shopId, session) => {
  const products = data.map(item => ({
    ...item,
    tenantId,
    shopId,
    status: 'active'
  }));
  return await Product.insertMany(products, { session });
};

/**
 * Bulk Insert Customers
 */
exports.importCustomers = async (data, tenantId, session) => {
  const customers = data.map(item => ({
    ...item,
    tenantId,
    status: 'active'
  }));
  return await Customer.insertMany(customers, { session });
};

/**
 * Bulk Insert Expenses
 */
exports.importExpenses = async (data, tenantId, shopId, session) => {
  const expenses = data.map(item => ({
    ...item,
    tenantId,
    shopId
  }));
  return await Expense.insertMany(expenses, { session });
};

/**
 * Bulk Insert Orders (Sales History)
 * Handles grouping items by invoiceNumber
 */
exports.importOrders = async (data, tenantId, shopId, session) => {
  const ordersMap = new Map();

  // Group items by invoiceNumber
  data.forEach(item => {
    const invNum = item.invoiceNumber || item.orderNumber;
    if (!ordersMap.has(invNum)) {
      ordersMap.set(invNum, {
        orderNumber: invNum,
        tenantId,
        shopId,
        customerId: item.customerId, // Should be pre-resolved or ID
        totalAmount: 0,
        items: [],
        createdAt: item.date ? new Date(item.date) : new Date(),
        status: 'completed',
        paymentMethod: item.paymentMethod || 'cash'
      });
    }
    
    const order = ordersMap.get(invNum);
    const itemTotal = (item.price || 0) * (item.quantity || 1);
    order.items.push({
      productId: item.productId,
      name: item.productName || item.name,
      quantity: item.quantity || 1,
      price: item.price || 0
    });
    order.totalAmount += itemTotal;
  });

  const ordersArray = Array.from(ordersMap.values());
  return await Order.insertMany(ordersArray, { session });
};
