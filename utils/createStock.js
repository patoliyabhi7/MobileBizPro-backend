const Stock = require('../models/stockModel');

const createStock = async (products = [], purchaseId, businessLocationId) => {
  const updatedProducts = [];

  for (const item of products) {
    if (!item.product) {
      throw new Error('Missing product reference in one of the stock items.');
    }

    if (item.imeiNo) {
      // Mobiles must have quantity = 1
      if (item.quantity !== 1) {
        throw new Error(`IMEI-based item must have quantity = 1`);
      }

      const existing = await Stock.findOne({ imeiNo: item.imeiNo });

      if (existing && existing.quantity > 0) {
        throw new Error(`Duplicate IMEI ${item.imeiNo} already exists and is in stock.`);
      }

      const stock = await Stock.create({
        product: item.product,
        imeiNo: item.imeiNo,
        serialNo: item.serialNo || null,
        color: item.color || null,
        storage: item.storage || null,
        purchaseRef: purchaseId,
        businessLocation: businessLocationId,
        quantity: 1,
        gstApplicable: item.gstApplicable || false,
        gstPercentage: item.gstPercentage || 18,
      });

      updatedProducts.push({ ...item, stockId: stock._id });

    } else {
      // Accessory: quantity >= 0
      if (item.quantity == null || item.quantity < 0) {
        throw new Error(`Accessories must have a quantity >= 0`);
      }

      const stock = await Stock.create({
        product: item.product,
        color: item.color || null,
        storage: item.storage || null,
        purchaseRef: purchaseId,
        businessLocation: businessLocationId,
        quantity: item.quantity,
        gstApplicable: item.gstApplicable || false,
        gstPercentage: item.gstPercentage || 18,
      });

      updatedProducts.push({ ...item, stockId: stock._id });
    }
  }

  return updatedProducts;
};

module.exports = createStock;
