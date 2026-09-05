require('dotenv').config();
const mongoose = require('mongoose');
const { organizationRequestService } = require('./container');

async function testApprove() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tijaratpro', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    const reqId = '6a4d3f31729fc3c24c17c772'; // from the user's request log
    const payload = {
      durationValue: 1,
      durationUnit: 'YEARS',
      maxBranches: 1
    };
    const reviewerId = '83c59d16-1417-44fe-8544-36186a190014'; // from user's JWT token payload

    console.log("Attempting to approve...");
    const org = await organizationRequestService.approveRequest(reqId, payload, reviewerId, '127.0.0.1');
    console.log("Success:", org);
  } catch (error) {
    console.error("FAILED WITH ERROR:", error);
    if (error.errors) {
      console.error("Validation Errors:", error.errors);
    }
  } finally {
    mongoose.disconnect();
  }
}

testApprove();
