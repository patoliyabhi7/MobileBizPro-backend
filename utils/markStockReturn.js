const Stock = require('../models/stockModel');

const markStockReturnedFromSale = async (products = []) => {
  for (const item of products) {
    const stockId = item.stockId;
    if (!stockId) continue;

    const stockItem = await Stock.findById(stockId);
    if (stockItem) {
      stockItem.status = 1; // Back to available
      await stockItem.save();
    }
  }
};

module.exports = { markStockReturnedFromSale };
