const Stock = require('../models/stockModel');

const consumeStock = async (products = []) => {
  for (const item of products) {
    const stockId = item.stockId;
    const quantityToConsume = item.quantity || 1;

    if (!stockId) throw new Error('Missing stockId in product item');

    const stockItem = await Stock.findById(stockId);

    if (!stockItem) throw new Error(`Stock not found for ID: ${stockId}`);

    if (stockItem.quantity < quantityToConsume) {
      throw new Error(`Insufficient quantity in stock for product: ${stockId}`);
    }

    stockItem.quantity -= quantityToConsume;
    await stockItem.save();
  }
};

module.exports = consumeStock;
