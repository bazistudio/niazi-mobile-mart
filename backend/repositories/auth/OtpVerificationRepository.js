const BaseRepository = require('../BaseRepository');
const OtpVerification = require('../../models/OtpVerification');

class OtpVerificationRepository extends BaseRepository {
  constructor() {
    super(OtpVerification);
  }
}

module.exports = OtpVerificationRepository;
