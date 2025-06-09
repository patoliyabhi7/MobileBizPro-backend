const Stock = require('../models/stockModel');

// Called when creating a Purchase: generate new stock entries for each unit
const createStock = async (products = [], purchaseId, businessLocationId) => {
  const updatedProducts = [];

  for (const item of products) {
    if (!item.product) {
      throw new Error('Missing product reference in one of the stock items.');
    }

    // Only validate if IMEI exists
    if (item.imeiNo) {
      const existing = await Stock.findOne({
        imeiNo: item.imeiNo,
      });

      if (existing && existing.status === 1) {
        throw new Error(`Duplicate IMEI ${item.imeiNo} for product already exists and is in stock (not sold or returned).`);
      }

      // if exists && status === 0 → allowed (second-hand logic)
    }

    const stock = await Stock.create({
      product: item.product,
      imeiNo: item.imeiNo || null,
      serialNo: item.serialNo || null,
      color: item.color || null,
      storage: item.storage || null,
      purchaseRef: purchaseId,
      businessLocation: businessLocationId,
      status: 1,
      gstApplicable: item.gstApplicable || false,
      gstPercentage: item.gstPercentage || 18,
    });

    updatedProducts.push({
      ...item,
      stockId: stock._id
    });
  }

  return updatedProducts;
};

module.exports = createStock;
