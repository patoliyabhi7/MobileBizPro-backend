const Stock = require('../models/stockModel');

const markStockReturnedFromSale = async (products = []) => {
  for (const item of products) {
    const { stockId, quantity = 1 } = item;
    if (!stockId) continue;

    const stockItem = await Stock.findById(stockId);
    if (!stockItem) continue;

    if (stockItem.imeiNo) {
      stockItem.quantity = 1;
      stockItem.status = 1;
    } else {
      stockItem.quantity += quantity;
    }

    await stockItem.save();
  }
};

module.exports = { markStockReturnedFromSale };
