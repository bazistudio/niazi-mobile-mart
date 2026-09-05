class SubscriptionService {
  constructor(
    subscriptionRepository,
    packageRepository,
    subscriptionHistoryRepository,
    paymentRequestRepository,
    organizationRepository,
    branchRepository,
    auditLogService,
    notificationService
  ) {
    this.subscriptionRepository = subscriptionRepository;
    this.packageRepository = packageRepository;
    this.subscriptionHistoryRepository = subscriptionHistoryRepository;
    this.paymentRequestRepository = paymentRequestRepository;
    this.organizationRepository = organizationRepository;
    this.branchRepository = branchRepository;
    this.auditLogService = auditLogService;
    this.notificationService = notificationService;
  }
  
  async syncOwnerStatus(ownerType, ownerId, status, session = null) {
    const update = { status: status === 'ACTIVE' ? 'active' : 'suspended' };
    const options = session ? { session } : {};
    
    if (ownerType === 'ORGANIZATION') {
      await this.organizationRepository.updateById(ownerId, update, options);
    } else if (ownerType === 'SHOP') {
      await this.branchRepository.updateById(ownerId, update, options);
    }
  }

  async logHistoryAndAudit(subscription, action, performedBy, notes = '', oldExpiry = null, newExpiry = null, paymentReference = null, priceInfo = {}, session = null, originalData = {}) {
    const historyData = {
      subscriptionId: subscription._id,
      ownerType: originalData.ownerType || 'ORGANIZATION',
      ownerId: originalData.ownerId || subscription.organizationId,
      packageId: originalData.packageId || subscription.planId,
      action,
      oldExpiry,
      newExpiry,
      performedBy,
      paymentReference,
      notes,
      ...priceInfo
    };

    const options = session ? { session } : {};
    await this.subscriptionHistoryRepository.create(historyData, options);

    if (performedBy) {
      const auditAction = `SUBSCRIPTION_${action}`;
      await this.auditLogService.log({
        userId: performedBy,
        action: auditAction,
        entityType: 'Subscription',
        entityId: subscription._id,
        details: notes || `Subscription ${action}`,
        sessionId: session ? session.id : null // pseudo pass session if needed
      });
    }
  }

  async checkActiveSubscription(ownerType, ownerId, session = null) {
    // V4 Schema uses organizationId instead of ownerId
    const query = { organizationId: ownerId, status: { $in: ['ACTIVE', 'PENDING'] } };
    const options = session ? { session, skipTenantGuard: true } : { skipTenantGuard: true };
    const existing = await this.subscriptionRepository.findMany(query, options);
    if (existing && existing.length > 0) {
      throw new Error('Customer already has an active or pending subscription');
    }
  }

  async createTrialSubscription(ownerType, ownerId, userId, session = null) {
    const options = session ? { session } : {};
    const trialPackages = await this.packageRepository.findMany({ isTrial: true, status: 'ACTIVE' }, { ...options, limit: 1 });
    if (!trialPackages || trialPackages.length === 0) {
      console.warn('No active Trial Package found in the system.');
      return null;
    }
    const pkg = trialPackages[0];

    await this.checkActiveSubscription(ownerType, ownerId, session);

    const startDate = new Date();
    const expiryDate = new Date();
    
    if (pkg.durationType === 'DAYS') expiryDate.setDate(expiryDate.getDate() + pkg.durationValue);
    else if (pkg.durationType === 'MONTHS') expiryDate.setMonth(expiryDate.getMonth() + pkg.durationValue);
    else if (pkg.durationType === 'YEARS') expiryDate.setFullYear(expiryDate.getFullYear() + pkg.durationValue);

    const subscriptionData = {
      ownerType,
      ownerId,
      packageId: pkg._id,
      subscriptionPrice: 0,
      status: 'ACTIVE',
      paymentStatus: 'PAID',
      startDate,
      expiryDate,
      approvedBy: userId,
      approvedAt: new Date(),
    };

    const subscription = await this.subscriptionRepository.create(subscriptionData, options);

    await this.logHistoryAndAudit(subscription, 'CREATED', userId, 'Trial subscription automatically created.', null, expiryDate, null, {}, session, subscriptionData);
    await this.syncOwnerStatus(ownerType, ownerId, 'ACTIVE', session);

    return subscription;
  }

  async createSubscription(data, userId) {
    await this.checkActiveSubscription(data.ownerType, data.ownerId);

    let pkg = null;
    if (data.packageId && data.packageId !== 'CUSTOM') {
      pkg = await this.packageRepository.findById(data.packageId);
      if (!pkg) throw new Error('Package not found');
    }

    const startDate = data.startDate || new Date();
    const expiryDate = new Date(startDate);
    
    const durationType = data.durationType || pkg?.durationType || 'MONTHS';
    const durationValue = data.durationValue || pkg?.durationValue || 1;

    if (durationType === 'DAYS') expiryDate.setDate(expiryDate.getDate() + durationValue);
    else if (durationType === 'MONTHS') expiryDate.setMonth(expiryDate.getMonth() + durationValue);
    else if (durationType === 'YEARS') expiryDate.setFullYear(expiryDate.getFullYear() + durationValue);

    data.startDate = startDate;
    data.expiryDate = expiryDate;
    data.status = 'ACTIVE';
    data.approvedBy = userId;
    data.approvedAt = new Date();
    
    data.durationType = durationType;
    data.durationValue = durationValue;
    data.subscriptionPrice = data.subscriptionPrice !== undefined ? data.subscriptionPrice : (pkg?.price || 0);
    
    data.limits = data.limits || {
      maxBranches: pkg?.maxBranches ?? 1,
      maxUsers: pkg?.maxUsers ?? 1,
      maxProducts: pkg?.maxProducts ?? 100,
      storageLimit: pkg?.storageLimit ?? 1024
    };
    
    data.enabledModules = data.enabledModules || pkg?.enabledModules || [];

    // Map legacy fields to V4 Subscription schema to prevent Mongoose 400 ValidationErrors
    data.organizationId = data.organizationId || data.ownerId;
    data.planId = data.planId || data.packageId || 'CUSTOM_PLAN';
    data.startsAt = data.startDate;
    data.expiresAt = data.expiryDate;

    const subscription = await this.subscriptionRepository.create(data);

    await this.logHistoryAndAudit(subscription, 'CREATED', userId, 'Subscription created manually by admin.', null, expiryDate, null, {}, null, data);
    await this.syncOwnerStatus(data.ownerType, data.ownerId, 'ACTIVE');
    
    return subscription;
  }

  async suspendSubscription(subscriptionId, reason, userId) {
    const subscription = await this.subscriptionRepository.findById(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');

    subscription.isSuspended = true;
    subscription.status = 'SUSPENDED';
    subscription.suspendReason = reason;
    await this.subscriptionRepository.updateById(subscriptionId, subscription);

    await this.logHistoryAndAudit(subscription, 'SUSPENDED', userId, reason);
    await this.syncOwnerStatus(subscription.ownerType, subscription.ownerId, 'SUSPENDED');
    
    return subscription;
  }

  async customizeSubscription(subscriptionId, data, userId) {
    const subscription = await this.subscriptionRepository.findById(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');

    const oldData = {
      price: subscription.subscriptionPrice,
      duration: `${subscription.durationValue} ${subscription.durationType}`,
      limits: subscription.limits,
      modules: subscription.enabledModules
    };

    if (data.subscriptionPrice !== undefined) subscription.subscriptionPrice = data.subscriptionPrice;
    if (data.durationType !== undefined) subscription.durationType = data.durationType;
    if (data.durationValue !== undefined) subscription.durationValue = data.durationValue;
    
    if (data.limits) {
      if (data.limits.maxBranches !== undefined) subscription.limits.maxBranches = data.limits.maxBranches;
      if (data.limits.maxUsers !== undefined) subscription.limits.maxUsers = data.limits.maxUsers;
      if (data.limits.maxProducts !== undefined) subscription.limits.maxProducts = data.limits.maxProducts;
      if (data.limits.storageLimit !== undefined) subscription.limits.storageLimit = data.limits.storageLimit;
    }

    if (data.enabledModules !== undefined) {
      subscription.enabledModules = data.enabledModules;
    }

    await this.subscriptionRepository.updateById(subscriptionId, subscription);

    const newData = {
      price: subscription.subscriptionPrice,
      duration: `${subscription.durationValue} ${subscription.durationType}`,
      limits: subscription.limits,
      modules: subscription.enabledModules
    };

    // Log the changes
    if (oldData.price !== newData.price) {
      await this.logHistoryAndAudit(subscription, 'PRICE_UPDATED', userId, `Price changed from ${oldData.price} to ${newData.price}`);
    }
    if (oldData.duration !== newData.duration) {
      await this.logHistoryAndAudit(subscription, 'DURATION_UPDATED', userId, `Duration changed from ${oldData.duration} to ${newData.duration}`);
    }
    if (JSON.stringify(oldData.limits) !== JSON.stringify(newData.limits)) {
      await this.logHistoryAndAudit(subscription, 'LIMIT_UPDATED', userId, `Limits customized`);
    }
    if (JSON.stringify(oldData.modules) !== JSON.stringify(newData.modules)) {
      await this.logHistoryAndAudit(subscription, 'MODULE_UPDATED', userId, `Modules customized`);
    }

    return subscription;
  }

  async expireSubscription(subscriptionId) {
    const subscription = await this.subscriptionRepository.findById(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');

    subscription.isSuspended = true;
    subscription.status = 'EXPIRED';
    subscription.suspendReason = 'Automatically suspended due to subscription expiry.';
    await this.subscriptionRepository.updateById(subscriptionId, subscription);

    await this.logHistoryAndAudit(subscription, 'EXPIRED', null, 'Subscription expired.');
    await this.syncOwnerStatus(subscription.ownerType, subscription.ownerId, 'SUSPENDED');
    
    return subscription;
  }

  async resumeSubscription(subscriptionId, userId) {
    const subscription = await this.subscriptionRepository.findById(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');

    if (subscription.expiryDate < new Date()) {
      throw new Error('Cannot resume an expired subscription. Please renew it.');
    }

    subscription.isSuspended = false;
    subscription.status = 'ACTIVE';
    subscription.suspendReason = null;
    await this.subscriptionRepository.updateById(subscriptionId, subscription);

    await this.logHistoryAndAudit(subscription, 'RESUMED', userId, 'Manually resumed');
    await this.syncOwnerStatus(subscription.ownerType, subscription.ownerId, 'ACTIVE');

    return subscription;
  }

  async renewSubscription(subscriptionId, paymentRequestId, newPrice, userId) {
    return await this.subscriptionRepository.transaction(async (session) => {
      const subscription = await this.subscriptionRepository.findById(subscriptionId, { session });
      if (!subscription) throw new Error('Subscription not found');

      const pkg = await this.packageRepository.findById(subscription.packageId, { session });
      if (!pkg) throw new Error('Package not found');
      
      const oldExpiry = subscription.expiryDate;
      const oldPrice = subscription.subscriptionPrice;
      
      const startDate = new Date();
      const expiryDate = new Date();
      
      if (oldExpiry > startDate) {
        expiryDate.setTime(oldExpiry.getTime());
      }

      if (pkg.durationType === 'DAYS') expiryDate.setDate(expiryDate.getDate() + pkg.durationValue);
      else if (pkg.durationType === 'MONTHS') expiryDate.setMonth(expiryDate.getMonth() + pkg.durationValue);
      else if (pkg.durationType === 'YEARS') expiryDate.setFullYear(expiryDate.getFullYear() + pkg.durationValue);

      subscription.expiryDate = expiryDate;
      subscription.status = 'ACTIVE';
      subscription.paymentStatus = 'PAID';
      subscription.isSuspended = false;
      subscription.lastRenewalDate = new Date();
      
      if (newPrice !== undefined && newPrice !== null) {
        subscription.subscriptionPrice = newPrice;
      }

      await this.subscriptionRepository.updateById(subscriptionId, subscription, { session });

      const oldPackageId = subscription.packageId;
      const newPackageId = subscription.packageId;

      await this.logHistoryAndAudit(
        subscription, 'RENEWED', userId, 'Subscription renewed', oldExpiry, expiryDate, paymentRequestId,
        { previousPrice: oldPrice, newPrice: subscription.subscriptionPrice, previousPackage: oldPackageId, newPackage: newPackageId }, session
      );
      
      await this.syncOwnerStatus(subscription.ownerType, subscription.ownerId, 'ACTIVE', session);

      return subscription;
    });
  }

  async manualRenewSubscription(subscriptionId, data, userId) {
    return await this.subscriptionRepository.transaction(async (session) => {
      const subscription = await this.subscriptionRepository.findById(subscriptionId, { session });
      if (!subscription) throw new Error('Subscription not found');

      const pkg = await this.packageRepository.findById(data.packageId, { session });
      if (!pkg) throw new Error('Package not found');
      
      const oldExpiry = subscription.expiryDate;
      const oldPrice = subscription.subscriptionPrice;
      const oldPackageId = subscription.packageId;

      let finalPrice = pkg.price || 0;
      if (data.discountType === 'FIXED') {
        finalPrice = Math.max(0, finalPrice - (data.discountValue || 0));
      } else if (data.discountType === 'PERCENTAGE') {
        finalPrice = Math.max(0, finalPrice - (finalPrice * ((data.discountValue || 0) / 100)));
      }

      const paymentData = {
        ownerType: subscription.ownerType,
        ownerId: subscription.ownerId,
        subscriptionId: subscription._id,
        packageId: pkg._id,
        amount: finalPrice,
        paymentMethod: 'MANUAL_ADMIN',
        transactionReference: 'MANUAL_RENEWAL_' + Date.now(),
        screenshotUrl: '',
        status: 'APPROVED',
        adminNotes: data.notes || 'Manually renewed by Super Admin',
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: userId
      };
      
      const payment = await this.paymentRequestRepository.create(paymentData, { session });

      const startDate = new Date();
      const expiryDate = new Date();
      
      if (oldExpiry > startDate) {
        expiryDate.setTime(oldExpiry.getTime());
      }

      if (pkg.durationType === 'DAYS') expiryDate.setDate(expiryDate.getDate() + pkg.durationValue);
      else if (pkg.durationType === 'MONTHS') expiryDate.setMonth(expiryDate.getMonth() + pkg.durationValue);
      else if (pkg.durationType === 'YEARS') expiryDate.setFullYear(expiryDate.getFullYear() + pkg.durationValue);

      subscription.packageId = pkg._id;
      subscription.expiryDate = expiryDate;
      subscription.status = 'ACTIVE';
      subscription.paymentStatus = 'PAID';
      subscription.isSuspended = false;
      subscription.lastRenewalDate = new Date();
      subscription.subscriptionPrice = finalPrice;
      
      await this.subscriptionRepository.updateById(subscriptionId, subscription, { session });

      await this.logHistoryAndAudit(
        subscription, 'RENEWED', userId, data.notes || 'Manual Renewal', oldExpiry, expiryDate, payment._id,
        { previousPrice: oldPrice, newPrice: finalPrice, previousPackage: oldPackageId, newPackage: pkg._id }, session
      );
      
      await this.syncOwnerStatus(subscription.ownerType, subscription.ownerId, 'ACTIVE', session);
      
      return subscription;
    });
  }

  // Payment Requests
  async createPaymentRequest(data) {
    const existing = await this.paymentRequestRepository.findOne({
      ownerType: data.ownerType,
      ownerId: data.ownerId,
      status: 'PENDING'
    });
    
    if (existing) {
      throw new Error('A payment request is already pending. Please wait for it to be reviewed.');
    }
    
    // Using static NotificationService if it's not fully refactored, but should ideally be injected
    if (this.notificationService && this.notificationService.createSystemNotification) {
        await this.notificationService.createSystemNotification({
            type: 'PAYMENT_REQUEST',
            message: `New payment request submitted for ${data.ownerType} ${data.ownerId}`,
            metadata: { ownerType: data.ownerType, ownerId: data.ownerId }
        });
    }

    return await this.paymentRequestRepository.create(data);
  }

  async approvePaymentRequest(requestId, newPrice, userId) {
    const request = await this.paymentRequestRepository.findById(requestId);
    if (!request || request.status !== 'PENDING') throw new Error('Invalid payment request');

    request.status = 'APPROVED';
    request.reviewedBy = userId;
    request.reviewedAt = new Date();
    await this.paymentRequestRepository.updateById(requestId, request);

    const subscription = await this.subscriptionRepository.findOne({ ownerType: request.ownerType, ownerId: request.ownerId });
    if (subscription) {
      await this.renewSubscription(subscription._id, request._id, newPrice, userId);
    }
    
    console.log(`[NotificationService] Payment request approved for ${request.ownerType} ${request.ownerId}`);

    return request;
  }

  async rejectPaymentRequest(requestId, reason, userId) {
    const request = await this.paymentRequestRepository.findById(requestId);
    if (!request || request.status !== 'PENDING') throw new Error('Invalid payment request');

    request.status = 'REJECTED';
    request.reviewedBy = userId;
    request.reviewedAt = new Date();
    request.notes = reason;
    await this.paymentRequestRepository.updateById(requestId, request);

    console.log(`[NotificationService] Payment request rejected for ${request.ownerType} ${request.ownerId}`);

    return request;
  }

  // Dashboard Analytics
  async getDashboardStats() {
    const totalOrganizations = await this.organizationRepository.count();
    
    const activeSubscriptions = await this.subscriptionRepository.count({ status: { $in: ['ACTIVE', 'active', 'TRIAL', 'trial'] } });
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    const expiringSoon = await this.subscriptionRepository.count({
      status: { $in: ['ACTIVE', 'active'] },
      expiresAt: { $gte: new Date(), $lte: targetDate }
    });

    const pendingPayments = await this.paymentRequestRepository.count({ status: 'PENDING' });

    // Package distribution and Revenue Calculation
    const packageDistributionData = await this.subscriptionRepository.aggregate([
      { $match: { status: { $in: ['ACTIVE', 'active', 'TRIAL', 'trial'] } } },
      { $group: { _id: '$planId', count: { $sum: 1 } } }
    ]);

    let revenue = 0;
    const packageDistribution = await Promise.all(packageDistributionData.map(async item => {
      let pkg = null;
      if (item._id) {
        try {
          pkg = await this.packageRepository.findById(item._id);
        } catch(e) {}
      }
      if (pkg && pkg.price) revenue += (pkg.price * item.count);
      return { package: pkg ? pkg.name : 'Unknown', count: item.count };
    }));

    // Mock growth for now
    const growth = [
      { month: 'Jan', count: 120 },
      { month: 'Feb', count: 180 },
      { month: 'Mar', count: activeSubscriptions }
    ];

    // Expiry widget details
    const expiringSubscriptions = await this.subscriptionRepository.findMany({
      status: { $in: ['ACTIVE', 'active'] },
      expiresAt: { $gte: new Date(), $lte: targetDate }
    }, { limit: 10, populate: 'planId' });

    const mappedExpiring = expiringSubscriptions.map(s => ({
      _id: s._id,
      ownerType: 'ORGANIZATION', // V4 is all orgs
      ownerId: s.organizationId,
      package: s.planId ? s.planId.name : 'Unknown',
      expiryDate: s.expiresAt
    }));

    // Recent Activity
    const recentActivity = await this.subscriptionHistoryRepository.findMany({}, { sort: { createdAt: -1 }, limit: 10 });

    return {
      totalOrganizations,
      activeSubscriptions,
      expiringSoon,
      revenue,
      pendingPayments,
      growth,
      packageDistribution,
      expiringDetails: mappedExpiring,
      recentActivity
    };
  }

  // Reports
  async getRevenueReport(filters = {}) {
    const matchStage = { status: 'APPROVED' };
    
    if (filters.startDate || filters.endDate) {
      matchStage.submittedAt = {};
      if (filters.startDate) matchStage.submittedAt.$gte = new Date(filters.startDate);
      if (filters.endDate) matchStage.submittedAt.$lte = new Date(filters.endDate);
    }
    
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: { $ifNull: ['$submittedAt', '$createdAt'] } },
            month: { $month: { $ifNull: ['$submittedAt', '$createdAt'] } }
          },
          transactions: { $sum: 1 },
          revenue: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ];

    const results = await this.paymentRequestRepository.aggregate(pipeline);
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    return results.map(r => ({
      month: `${monthNames[r._id.month - 1]} ${r._id.year}`,
      transactions: r.transactions,
      revenue: r.revenue
    }));
  }

  async getPackagePerformanceReport(filters = {}) {
    const matchStage = { status: { $in: ['ACTIVE', 'active', 'TRIAL', 'trial'] } };
    
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$planId',
          subscribers: { $sum: 1 }
        }
      }
    ];

    const results = await this.subscriptionRepository.aggregate(pipeline);
    
    const populated = await Promise.all(results.map(async item => {
      let pkg = null;
      if (item._id) {
        try {
          pkg = await this.packageRepository.findById(item._id);
        } catch(e) {}
      }
      return {
        package: pkg ? pkg.name : 'Unknown',
        subscribers: item.subscribers,
        revenue: pkg ? (pkg.price * item.subscribers) : 0
      };
    }));

    return populated.sort((a, b) => b.revenue - a.revenue);
  }

  async getExpiryReport(filters = {}) {
    const matchStage = { status: { $in: ['active', 'ACTIVE'] } };
    
    const targetDate = new Date();
    const days = parseInt(filters.days) || 30;
    targetDate.setDate(targetDate.getDate() + days);
    
    matchStage.expiresAt = { $gte: new Date(), $lte: targetDate };

    const pipeline = [
      { $match: matchStage },
      { $sort: { expiresAt: 1 } },
    ];

    if (filters.limit) {
      pipeline.push({ $limit: parseInt(filters.limit) });
    }

    const subscriptions = await this.subscriptionRepository.aggregate(pipeline);
    
    const populated = await Promise.all(subscriptions.map(async sub => {
      let pkg = null;
      if (sub.planId) {
        try {
          pkg = await this.packageRepository.findById(sub.planId);
        } catch(e) {}
      }
      
      const expiry = new Date(sub.expiresAt);
      const remainingDays = Math.max(0, Math.ceil((expiry.getTime() - new Date().getTime()) / (1000 * 3600 * 24)));
      
      return {
        organization: sub.organizationId ? sub.organizationId.toString() : 'Unknown',
        package: pkg ? pkg.name : 'Unknown',
        expiryDate: expiry.toISOString().split('T')[0],
        remainingDays
      };
    }));

    return populated;
  }
}

module.exports = SubscriptionService;
