const { AppError } = require('../utils/errors');

class PaymentRequestService {
  constructor(paymentRequestRepository, subscriptionService, auditLogService) {
    this.paymentRequestRepository = paymentRequestRepository;
    this.subscriptionService = subscriptionService;
    this.auditLogService = auditLogService;
  }

  async createPaymentRequest(data) {
    // Basic validation
    if (!data.subscriptionId && !data.packageId) {
      throw new AppError("Must specify a subscription or package", 400);
    }
    
    data.status = 'PENDING';
    data.requestDate = new Date();
    
    const request = await this.paymentRequestRepository.create(data);
    return request;
  }

  async getPaymentRequests(query = {}, options = {}) {
    return await this.paymentRequestRepository.findMany(query, { populate: 'packageId', ...options });
  }

  async approvePaymentRequest(id, actorId) {
    const request = await this.paymentRequestRepository.findById(id);
    if (!request || request.status !== 'PENDING') {
      throw new AppError("Payment request not found or not pending", 400);
    }

    request.status = 'APPROVED';
    request.processedBy = actorId;
    request.processedAt = new Date();
    await this.paymentRequestRepository.updateById(id, request);

    // Call subscription service to update/renew
    if (request.subscriptionId) {
      await this.subscriptionService.manualRenewSubscription(request.subscriptionId, {
        durationValue: request.durationValue || 1, // simplified
        paymentReference: request.referenceNumber
      }, actorId);
    } else {
      // Need to create new subscription logic here if it was for a new package without existing sub
      throw new AppError("New subscription creation from payment request not fully supported yet", 501);
    }

    await this.auditLogService.log({
      userId: actorId,
      action: 'PAYMENT_APPROVED',
      entityType: 'PaymentRequest',
      entityId: id,
      details: `Payment request ${id} approved`
    });

    return request;
  }

  async rejectPaymentRequest(id, reason, actorId) {
    const request = await this.paymentRequestRepository.findById(id);
    if (!request || request.status !== 'PENDING') {
      throw new AppError("Payment request not found or not pending", 400);
    }

    request.status = 'REJECTED';
    request.rejectionReason = reason;
    request.processedBy = actorId;
    request.processedAt = new Date();
    await this.paymentRequestRepository.updateById(id, request);

    await this.auditLogService.log({
      userId: actorId,
      action: 'PAYMENT_REJECTED',
      entityType: 'PaymentRequest',
      entityId: id,
      details: `Payment request ${id} rejected`
    });

    return request;
  }
}

module.exports = PaymentRequestService;
