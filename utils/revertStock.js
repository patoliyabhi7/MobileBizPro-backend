const Stock = require('../models/stockModel');

const revertStock = async (products = []) => {
  for (const item of products) {
    const stockId = item.stockId;
    const quantityToRevert = item.quantity || 1;

    if (!stockId) continue;

    const stockItem = await Stock.findById(stockId);

    if (stockItem) {
      stockItem.quantity += quantityToRevert;
      await stockItem.save();
    }
  }
};

module.exports = revertStock;
