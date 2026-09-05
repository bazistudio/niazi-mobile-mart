const invoiceService = require('../services/invoiceService');
const tenantPopulate = require('../utils/tenantPopulate');

/**
 * @desc    Get Invoice PDF
 * @route   GET /api/invoices/:id/pdf
 * @access  Private
 */
exports.downloadInvoicePDF = async (req, res) => {
  try {
    const pdfBuffer = await invoiceService.getInvoicePDF(req.params.id, req.tenantId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${req.params.id}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all invoices for tenant
 * @route   GET /api/invoices
 * @access  Private
 */
exports.getInvoices = async (req, res) => {
  try {
    const Invoice = require('../models/Invoice');
    const invoices = await Invoice.find({ tenantId: req.tenantId })
      .populate(tenantPopulate('customerId', 'name email', req.tenantId))
      .sort({ createdAt: -1 });

    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
