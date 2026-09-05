const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require('../utils/errors');

class ShopService {
  constructor(branchRepository, auditLogService, subscriptionService) {
    this.branchRepository = branchRepository;
    this.auditLogService = auditLogService;
    this.subscriptionService = subscriptionService;
  }

  async createShop({ name, ownerName, phone, email, address, city, planId, createdBy, organizationId }) {
    if (email) {
      const existing = await this.branchRepository.findOne({ email: email.toLowerCase().trim(), isDeleted: false, organizationId });
      if (existing) throw new ConflictError("A shop with this email already exists in your organization");
    }

    const shop = await this.branchRepository.create({
      name,
      ownerName: ownerName || "",
      phone: phone || "",
      email: email ? email.toLowerCase().trim() : "",
      address: address || "",
      city: city || "",
      planId: planId || null,
      organizationId,
      createdBy,
      status: "active",
      isDeleted: false,
    });

    await this.auditLogService.log({
      userId: createdBy,
      action: 'SHOP_CREATED',
      entityType: 'Branch',
      entityId: shop._id,
      details: `Branch ${name} created`
    });

    try {
      await this.subscriptionService.createTrialSubscription('SHOP', shop._id, createdBy);
    } catch (err) {
      console.error('[ShopService] Failed to create trial subscription:', err);
    }

    return shop;
  }

  async getAllShops(organizationId, { status } = {}) {
    const filter = { isDeleted: false, organizationId };
    if (status) filter.status = status;

    return await this.branchRepository.findMany(filter, { 
      populate: { path: "createdBy", select: "name email" }, 
      sort: { createdAt: -1 } 
    });
  }

  async getShopById(shopId, organizationId) {
    const shop = await this.branchRepository.findOne({ _id: shopId, organizationId, isDeleted: false }, {
      populate: { path: "createdBy", select: "name email" }
    });

    if (!shop) throw new NotFoundError("Branch not found");
    return shop;
  }

  async getMyShop(ownerId) {
    const shop = await this.branchRepository.findOne({ _id: ownerId, isDeleted: false });

    if (!shop) throw new Error("Branch not found for this account");
    return shop;
  }

  async updateShop(shopId, organizationId, updates, actorId) {
    const shop = await this.branchRepository.findOne({ _id: shopId, organizationId, isDeleted: false });
    if (!shop) throw new NotFoundError("Branch not found");

    if (updates.email && updates.email !== shop.email) {
      const collision = await this.branchRepository.findOne({
        email: updates.email.toLowerCase().trim(),
        isDeleted: false,
        organizationId,
        _id: { $ne: shopId },
      });
      if (collision) throw new ConflictError("A shop with this email already exists in your organization");
      updates.email = updates.email.toLowerCase().trim();
    }

    const allowed = ["name", "ownerName", "phone", "email", "address", "city", "planId", "ownerId"];
    allowed.forEach((key) => {
      if (updates[key] !== undefined) shop[key] = updates[key];
    });

    await this.branchRepository.updateById(shopId, shop);

    await this.auditLogService.log({
      userId: actorId,
      action: 'SHOP_UPDATED',
      entityType: 'Branch',
      entityId: shopId,
      details: `Branch details updated`
    });

    return shop;
  }

  async toggleShopStatus(shopId, organizationId, newStatus, actorId) {
    const shop = await this.branchRepository.findOne({ _id: shopId, organizationId, isDeleted: false });
    if (!shop) throw new NotFoundError("Branch not found");

    const validStatuses = ["active", "suspended", "inactive"];
    if (!validStatuses.includes(newStatus)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }

    shop.status = newStatus;
    await this.branchRepository.updateById(shopId, shop);

    await this.auditLogService.log({
      userId: actorId,
      action: 'SHOP_STATUS_CHANGED',
      entityType: 'Branch',
      entityId: shopId,
      details: `Branch status changed to ${newStatus}`
    });

    return shop;
  }

  async deleteShop(shopId, organizationId, actorId) {
    const shop = await this.branchRepository.findOne({ _id: shopId, organizationId, isDeleted: false });
    if (!shop) throw new NotFoundError("Branch not found");

    const activeShopsCount = await this.branchRepository.count({ organizationId, isDeleted: false });
    if (activeShopsCount <= 1) {
      throw new ForbiddenError("Cannot delete the last remaining shop in the organization.");
    }

    shop.isDeleted = true;
    shop.status = "inactive";
    await this.branchRepository.updateById(shopId, shop);

    await this.auditLogService.log({
      userId: actorId,
      action: 'SHOP_DELETED',
      entityType: 'Branch',
      entityId: shopId,
      details: `Branch ${shop.name} was deleted`
    });

    return { message: `Branch "${shop.name}" has been deleted` };
  }
}

module.exports = ShopService;
