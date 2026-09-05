// controllers/billing.controller.js

const billingService = require("../services/billing.service");

// ─── @desc    Get all invoices for the logged-in shop
// ─── @route   GET /api/billing/invoices
// ─── @access  Private
exports.getInvoices = async (req, res) => {
  try {
    const shopId = req.user.shopId;

    const invoices = await billingService.getInvoices(shopId);

    return res.status(200).json({
      success: true,
      message: "Invoices fetched successfully",
      data: invoices,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── @desc    Get a single invoice by ID
// ─── @route   GET /api/billing/invoices/:id
// ─── @access  Private
exports.getInvoiceById = async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { id } = req.params;

    const invoice = await billingService.getInvoiceById(shopId, id);

    return res.status(200).json({
      success: true,
      message: "Invoice fetched",
      data: invoice,
    });
  } catch (error) {
    const status = error.message === "Invoice not found" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ─── @desc    Record a payment for an invoice
// ─── @route   POST /api/billing/pay
// ─── @access  Private
exports.recordPayment = async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { invoiceId, amount, method, reference } = req.body;

    if (!invoiceId || !amount || !method) {
      return res.status(400).json({
        success: false,
        message: "invoiceId, amount, and method are required",
      });
    }

    const result = await billingService.recordPayment({
      shopId,
      invoiceId,
      amount,
      method,
      reference,
    });

    return res.status(200).json({
      success: true,
      message: "Payment recorded successfully",
      data: result,
    });
  } catch (error) {
    const knownErrors = ["Invoice not found", "Invoice already paid"];
    const status = knownErrors.includes(error.message) ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

// ─── @desc    Log extra service usage (SMS / WhatsApp / AI / Maps)
// ─── @route   POST /api/billing/log-usage
// ─── @access  Private
exports.logUsage = async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { service, usageCount, pricePerUnit } = req.body;

    const validServices = ["sms", "whatsapp", "ai", "maps"];
    if (!service || !validServices.includes(service)) {
      return res.status(400).json({
        success: false,
        message: `service must be one of: ${validServices.join(", ")}`,
      });
    }

    if (!usageCount || !pricePerUnit) {
      return res.status(400).json({
        success: false,
        message: "usageCount and pricePerUnit are required",
      });
    }

    const usageLog = await billingService.logUsage({
      shopId,
      service,
      usageCount,
      pricePerUnit,
    });

    return res.status(201).json({
      success: true,
      message: "Usage logged and invoice updated",
      data: usageLog,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── @desc    Get usage logs for a shop (optionally filter by service)
// ─── @route   GET /api/billing/usage?service=sms
// ─── @access  Private
exports.getUsageLogs = async (req, res) => {
  try {
    const shopId = req.user.shopId;
    const { service } = req.query;

    const logs = await billingService.getUsageLogs(shopId, service);

    return res.status(200).json({
      success: true,
      message: "Usage logs fetched",
      data: logs,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── @desc    Get all payments made by the shop
// ─── @route   GET /api/billing/payments
// ─── @access  Private
exports.getPayments = async (req, res) => {
  try {
    const shopId = req.user.shopId;

    const payments = await billingService.getPayments(shopId);

    return res.status(200).json({
      success: true,
      message: "Payments fetched successfully",
      data: payments,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── @desc    Get billing summary (totals, usage breakdown)
// ─── @route   GET /api/billing/summary
// ─── @access  Private
exports.getBillingSummary = async (req, res) => {
  try {
    const shopId = req.user.shopId;

    const summary = await billingService.getBillingSummary(shopId);

    return res.status(200).json({
      success: true,
      message: "Billing summary fetched",
      data: summary,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── @desc    Mark overdue invoices (run via cron / admin trigger)
// ─── @route   POST /api/billing/mark-overdue
// ─── @access  Private (superadmin)
exports.markOverdue = async (req, res) => {
  try {
    const count = await billingService.markOverdueInvoices();

    return res.status(200).json({
      success: true,
      message: `${count} invoice(s) marked as overdue`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
