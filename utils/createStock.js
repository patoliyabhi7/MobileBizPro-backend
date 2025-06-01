const Stock = require('../models/stockModel');

// Called when creating a Purchase: generate new stock entries for each unit
const createStock = async (products = [], purchaseId, businessLocationId) => {
  for (const item of products) {
    // Avoid duplicates by IMEI or serial
    const exists = await Stock.findOne({
      $or: [
        { imeiNo: item.imeiNo || null },
        { serialNo: item.serialNo || null }
      ].filter(cond => Object.values(cond)[0] !== null)
    });
    if (exists) continue;

    const stock = new Stock({
      product: item.product,
      serialNo: item.serialNo,
      imeiNo: item.imeiNo,
      color: item.color,
      storage: item.storage,
      purchaseRef: purchaseId,
      businessLocation: businessLocationId,
      status: 1
    });

    await stock.save();
  }
};

module.exports = createStock;
