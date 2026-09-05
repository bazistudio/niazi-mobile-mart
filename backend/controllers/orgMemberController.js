const { orgMemberService } = require('../container');

exports.addMember = async (req, res) => {
  try {
    const member = await orgMemberService.addMember(req.orgContext.organizationId, req.body.userId, req.body, req.user.id);
    res.status(201).json({ success: true, data: member });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add member', error: error.message });
  }
};

exports.updateMember = async (req, res) => {
  try {
    const member = await orgMemberService.updateMember(req.params.memberId, req.orgContext.organizationId, req.body, req.user.id);
    res.status(200).json({ success: true, data: member });
  } catch (error) {
    const status = error.message && error.message.includes('Forbidden') ? 403 : error.message && error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, message: 'Failed to update member', error: error.message });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const result = await orgMemberService.removeMember(req.params.memberId, req.orgContext.organizationId, req.user.id);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    const status = error.message && error.message.includes('Cannot remove') ? 400 : error.message && error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ success: false, message: 'Failed to remove member', error: error.message });
  }
};

exports.getMembers = async (req, res) => {
  try {
    const members = await orgMemberService.getMembers(req.orgContext.organizationId);
    res.status(200).json({ success: true, data: members });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch members', error: error.message });
  }
};

