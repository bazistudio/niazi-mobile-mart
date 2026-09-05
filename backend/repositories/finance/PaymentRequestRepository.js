const BaseRepository = require('../BaseRepository');
const PaymentRequest = require('../../models/PaymentRequest');

class PaymentRequestRepository extends BaseRepository {
  constructor() {
    super(PaymentRequest);
  }
}

module.exports = PaymentRequestRepository;
