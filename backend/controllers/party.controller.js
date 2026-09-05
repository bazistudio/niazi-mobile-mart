const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');

// @desc    Create a new party
// @route   POST /api/parties
// @access  Private
exports.addParty = async (req, res) => {
  try {
    const { type, companyName, contactPerson, email, phone, address, openingBalance, openingBalanceType } = req.body;

    if (!type || !contactPerson) {
      return res.status(400).json({ success: false, message: "Type and contact person are required" });
    }

    // Generate a unique partyCode
    const count = await Party.countDocuments({ organizationId: req.user.organizationId || req.tenantId });
    const partyCode = `PTY-${(count + 1).toString().padStart(4, '0')}`;

    const party = new Party({
      type,
      partyCode,
      companyName,
      contactPerson,
      email,
      phone,
      address,
      openingBalance: openingBalance || 0,
      openingBalanceType: openingBalanceType || 'DR',
      organizationId: req.user.organizationId || req.tenantId,
      tenantId: req.tenantId,
    });

    const savedParty = await party.save();

    // If there is an opening balance, create the initial LedgerEntry
    if (savedParty.openingBalance > 0) {
      const ledgerEntry = new LedgerEntry({
        systemAccountId: "PARTY_ACCOUNT",
        partyId: savedParty._id,
        transactionId: savedParty._id, // Using party ID as transaction ID for opening balance
        referenceType: "OPENING_BALANCE",
        referenceId: savedParty._id,
        type: savedParty.openingBalanceType,
        amount: savedParty.openingBalance,
        tenantId: req.tenantId,
        organizationId: req.user.organizationId || req.tenantId,
      });
      await ledgerEntry.save();
    }

    res.status(201).json({
      success: true,
      message: "Party created successfully",
      data: savedParty,
    });
  } catch (error) {
    console.error('Create Party Error:', error);
    res.status(500).json({ success: false, message: 'Server error creating party', error: error.message });
  }
};

// @desc    Get all active parties
// @route   GET /api/parties
// @access  Private
exports.getParties = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const query = {
      isActive: true,
    };

    const parties = await Party.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Party.countDocuments(query);

    res.status(200).json({
      success: true,
      message: "Parties fetched successfully",
      data: parties,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get Parties Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching parties', error: error.message });
  }
};

// @desc    Get party details
// @route   GET /api/parties/:id
// @access  Private
exports.getPartyDetail = async (req, res) => {
  try {
    const party = await Party.findOne({
      _id: req.params.id,
    });

    if (!party) {
      return res.status(404).json({ success: false, message: 'Party not found' });
    }

    res.status(200).json({
      success: true,
      data: party,
    });
  } catch (error) {
    console.error('Get Party Detail Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching party', error: error.message });
  }
};

// @desc    Update a party
// @route   PATCH /api/parties/:id
// @access  Private
exports.updateParty = async (req, res) => {
  try {
    const { type, companyName, contactPerson, email, phone, address, isActive } = req.body;
    
    const party = await Party.findOne({ _id: req.params.id });

    if (!party) {
      return res.status(404).json({ success: false, message: 'Party not found' });
    }

    if (type) party.type = type;
    if (companyName !== undefined) party.companyName = companyName;
    if (contactPerson) party.contactPerson = contactPerson;
    if (email !== undefined) party.email = email;
    if (phone !== undefined) party.phone = phone;
    if (address !== undefined) party.address = address;
    if (isActive !== undefined) party.isActive = isActive;

    const updatedParty = await party.save();
    
    res.status(200).json({
      success: true,
      message: "Party updated successfully",
      data: updatedParty,
    });
  } catch (error) {
    console.error('Update Party Error:', error);
    res.status(500).json({ success: false, message: 'Server error updating party', error: error.message });
  }
};

// @desc    Delete a party (Soft Delete)
// @route   DELETE /api/parties/:id
// @access  Private
exports.deleteParty = async (req, res) => {
  try {
    const party = await Party.findOne({
      _id: req.params.id,
    });

    if (!party) {
      return res.status(404).json({ success: false, message: "Party not found" });
    }

    party.isActive = false;
    await party.save();

    res.status(200).json({
      success: true,
      message: "Party deactivated",
    });
  } catch (error) {
    console.error('Delete Party Error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting party', error: error.message });
  }
};

// @desc    Get chronological ledger for the party
// @route   GET /api/parties/:id/ledger
// @access  Private
exports.getPartyLedger = async (req, res) => {
  try {
    const partyId = req.params.id;

    const party = await Party.findOne({ _id: partyId });
    if (!party) {
      return res.status(404).json({ success: false, message: 'Party not found' });
    }

    // Get all ledger entries for this party
    const ledgerEntries = await LedgerEntry.find({
      partyId
    }).sort({ createdAt: 1 }); // Chronological order

    let runningBalance = 0;
    
    const formattedLedger = ledgerEntries.map(entry => {
      // DR increases balance (they owe us), CR decreases balance (we owe them)
      if (entry.type === 'DR') {
        runningBalance += entry.amount;
      } else if (entry.type === 'CR') {
        runningBalance -= entry.amount;
      }

      return {
        _id: entry._id,
        date: entry.createdAt,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        type: entry.type,
        amount: entry.amount,
        runningBalance: runningBalance,
        notes: entry.notes || ''
      };
    });

    res.status(200).json({
      success: true,
      data: {
        party,
        ledger: formattedLedger,
        currentBalance: runningBalance
      }
    });
  } catch (error) {
    console.error('Get Party Ledger Error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching party ledger', error: error.message });
  }
};
