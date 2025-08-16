const Stock = require('../models/stockModel');

const createStock = async (products = [], purchaseId, businessLocationId) => {
  const updatedProducts = [];

  for (const item of products) {
    if (!item.product) throw new Error('Missing product reference in one of the stock items.');

    const baseData = {
      product: item.product,
      serialNo: item.serialNo || null,
      imeiNo: item.imeiNo || null,
      color: item.color || null,
      storage: item.storage || null,
      unitCost: item.unitCost || 0,
      businessLocation: businessLocationId,
      gstApplicable: item.gstApplicable || false,
      gstPercentage: item.gstPercentage || 18,
    };

    if (item.imeiNo) {
      if (item.quantity !== 1) throw new Error(`IMEI-based item must have quantity = 1`);

      const existing = await Stock.findOne({ imeiNo: item.imeiNo });
      if (existing && existing.status !== 0) {
        throw new Error(`Duplicate IMEI ${item.imeiNo} already exists and is in stock.`);
      }

      const stock = await Stock.create({
        ...baseData,
        quantity: 1,
        initialQuantity: 1,
        status: 1,
      });

      updatedProducts.push({ ...item, stockId: stock._id });

    } else {
      if (item.quantity == null || item.quantity < 0) {
        throw new Error(`Accessories must have a quantity >= 0`);
      }

      const stock = await Stock.create({
        ...baseData,
        quantity: item.quantity,
        initialQuantity: item.quantity,
        status: 1, // for accessories, status is ignored but kept consistent
      });

      updatedProducts.push({ ...item, stockId: stock._id });
    }
  }

  return updatedProducts;
};

module.exports = createStock;
