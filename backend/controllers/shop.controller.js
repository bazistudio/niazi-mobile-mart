const { shopService } = require("../container");

exports.createShop = async (req, res) => {
  try {
    const { name, ownerName, phone, email, address, city, planId } = req.body;

    const shop = await shopService.createShop({
      name,
      ownerName,
      phone,
      email,
      address,
      city,
      planId,
      organizationId: req.orgContext.organizationId,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Shop created successfully",
      data: shop,
    });
  } catch (error) {
    const status = error.message && error.message.includes("already exists") ? 409 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.getAllShops = async (req, res) => {
  try {
    const { status } = req.query;
    const shops = await shopService.getAllShops(req.orgContext.organizationId, { status });

    return res.status(200).json({
      success: true,
      message: "Shops fetched successfully",
      total: shops.length,
      data: shops,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getShopById = async (req, res) => {
  try {
    const shop = await shopService.getShopById(req.params.id, req.orgContext.organizationId);
    return res.status(200).json({
      success: true,
      message: "Shop fetched",
      data: shop,
    });
  } catch (error) {
    const status = error.message === "Branch not found" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.getMyShop = async (req, res) => {
  try {
    const shop = await shopService.getMyShop(req.user.shopId);
    return res.status(200).json({
      success: true,
      message: "Your shop fetched",
      data: shop,
    });
  } catch (error) {
    const status = error.message && error.message.includes("not found") ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.updateShop = async (req, res) => {
  try {
    const shop = await shopService.updateShop(req.params.id, req.orgContext.organizationId, req.body, req.user._id);
    return res.status(200).json({
      success: true,
      message: "Shop updated successfully",
      data: shop,
    });
  } catch (error) {
    const status =
      error.message === "Branch not found"
        ? 404
        : error.message && error.message.includes("already exists")
        ? 409
        : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.toggleShopStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "status is required (active | suspended | inactive)",
      });
    }

    const shop = await shopService.toggleShopStatus(req.params.id, req.orgContext.organizationId, status, req.user._id);
    return res.status(200).json({
      success: true,
      message: `Shop status set to "${shop.status}"`,
      data: shop,
    });
  } catch (error) {
    const status = error.message === "Branch not found" ? 404 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
};

exports.deleteShop = async (req, res) => {
  try {
    const result = await shopService.deleteShop(req.params.id, req.orgContext.organizationId, req.user._id);
    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    const status = error.message === "Branch not found" ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};
