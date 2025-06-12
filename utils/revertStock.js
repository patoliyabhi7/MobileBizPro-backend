const Stock = require('../models/stockModel');

const revertStock = async (products = []) => {
  for (const item of products) {
    const { stockId, quantity = 1 } = item;
    if (!stockId) continue;

    const stockItem = await Stock.findById(stockId);
    if (!stockItem) continue;

    if (stockItem.imeiNo) {
      stockItem.status = 1; // Mark mobile as available again
    } else {
      stockItem.quantity += quantity;
    }

    await stockItem.save();
  }
};

module.exports = revertStock;
