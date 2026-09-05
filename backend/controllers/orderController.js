const orderService = require('../services/orderService');

/**
 * @desc    Create new order and reduce stock
 * @route   POST /api/orders
 * @access  Private
 */
exports.createOrder = async (req, res) => {
  try {
    const { items, customerId, paymentMethod, transactionType, taxRate = 0, discount = 0, linkedInvoiceId } = req.body;
    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
    const tenantId = req.user.tenantId || req.tenantId;
    const shopId = req.user.shopId || req.shopId || tenantId;
    const userId = req.user._id;

    if (!tenantId || !shopId) {
      throw new Error("Missing tenantId or shopId in request user context");
    }

    const order = await orderService.processOrder({
      items,
      customerId,
      paymentMethod,
      transactionType,
      taxRate,
      discount,
      linkedInvoiceId,
      tenantId,
      shopId,
      userId,
      idempotencyKey
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully and stock updated",
      order
    });
  } catch (error) {
    require('fs').writeFileSync('last_order_error.txt', error.stack);
    console.error("🔥 ORDER API ERROR START 🔥");
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
    console.error("🔥 ORDER API ERROR END 🔥");

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * @desc    Get all orders for tenant
 * @route   GET /api/orders
 * @access  Private
 */
exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const tenantId = req.user.tenantId || req.tenantId;
    const branchId = req.user.branchId || req.branchId || req.user.shopId || req.shopId;
    const isOrgAdminOrOwner = req.user.role === 'SUPER_ADMIN' || req.user.role === 'OWNER' || req.user.role === 'ADMIN' || req.user.isSystemOwner;

    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.customerId) filters.partyId = req.query.customerId;

    // Enforce branch isolation for shop-scoped users or explicit query
    if (!isOrgAdminOrOwner && branchId) {
      filters.branchId = branchId;
    } else if (req.query.branchId || req.query.shopId) {
      filters.branchId = req.query.branchId || req.query.shopId;
    }
    
    // If searching by order number, skip date filtering to search all time
    if (req.query.orderNumber) {
      const escapedOrderNumber = req.query.orderNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filters.displayNumber = { $regex: escapedOrderNumber, $options: 'i' };
    } else {
      // Generic date range filter
      if (req.query.startDate || req.query.endDate) {
        filters.createdAt = {};
        if (req.query.startDate) {
          filters.createdAt.$gte = new Date(req.query.startDate);
        }
        if (req.query.endDate) {
          const end = new Date(req.query.endDate);
          end.setUTCHours(23, 59, 59, 999);
          filters.createdAt.$lte = end;
        }
      }
    }

    const { orders, total } = await orderService.getOrders({
      tenantId,
      filters,
      page,
      limit
    });

    res.json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    require('fs').writeFileSync('last_order_error.txt', error.stack);
    console.error("🔥 ORDER API ERROR START 🔥");
    console.error("Message:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get single order by ID
 * @route   GET /api/orders/:id
 * @access  Private
 */
exports.getOrderById = async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const order = await orderService.getOrderById(req.params.id, tenantId);

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    console.error("🔥 ORDER API ERROR START 🔥");
    console.error("Message:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update order status (completed, cancelled, etc.)
 * @route   PATCH /api/orders/:id/status
 * @access  Private
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const tenantId = req.user.tenantId || req.tenantId;
    const userId = req.user._id;

    const order = await orderService.updateOrderStatus({
      orderId: req.params.id,
      status,
      tenantId,
      userId
    });

    res.json({ success: true, message: `Order marked as ${status}`, order });
  } catch (error) {
    console.error("🔥 ORDER API ERROR START 🔥");
    console.error("Message:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
