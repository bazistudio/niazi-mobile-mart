const Lead = require('../models/Lead');

/**
 * @desc    Create new lead from marketing site
 * @route   POST /api/leads
 * @access  Public
 */
exports.createLead = async (req, res) => {
  try {
    const { name, phone, shopName, city, businessType } = req.body;

    // Basic validation
    if (!name || !phone || !shopName || !city || !businessType) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    const lead = await Lead.create({
      name,
      phone,
      shopName,
      city,
      businessType,
    });

    res.status(201).json({
      success: true,
      data: lead,
      message: 'Thank you for your interest! We will contact you soon for early access.',
    });
  } catch (error) {
    console.error('[LEAD_CREATE_ERROR]:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server Error. Please try again later.',
    });
  }
};

/**
 * @desc    Get all leads (for admin panel later)
 * @route   GET /api/leads
 * @access  Private/Admin
 */
exports.getLeads = async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
    });
  }
};
