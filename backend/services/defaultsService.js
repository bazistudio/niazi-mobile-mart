const Warehouse = require("../models/Warehouse");
const PriceList = require("../models/PriceList");

exports.getDefaultWarehouse = async (organizationId, shopId, session = null) => {
  let warehouse = await Warehouse.findOne({ organizationId, warehouseCode: 'MAIN-WH' }).session(session);
  if (!warehouse) {
    warehouse = await Warehouse.findOne({ organizationId, isDefault: true }).session(session);
  }
  if (!warehouse) {
    warehouse = new Warehouse({
      name: "Main Warehouse",
      warehouseCode: "MAIN-WH",
      isDefault: true,
      organizationId,
      shopId,
      status: "active"
    });
    await warehouse.save({ session });
  }
  return warehouse;
};

exports.getDefaultPriceList = async (organizationId, shopId, session = null) => {
  let priceList = await PriceList.findOne({ organizationId, priceListCode: 'STD' }).session(session);
  if (!priceList) {
    priceList = await PriceList.findOne({ organizationId, isActive: true }).sort({ priority: 1 }).session(session);
  }
  if (!priceList) {
    priceList = new PriceList({
      name: "Standard Price List",
      priceListCode: "STD",
      type: "STANDARD",
      currency: "PKR", // Should dynamically fetch tenant default currency later
      isActive: true,
      priority: 1,
      organizationId,
      shopId
    });
    await priceList.save({ session });
  }
  return priceList;
};
