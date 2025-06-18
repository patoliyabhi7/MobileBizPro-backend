const Stock = require('../models/stockModel');

const consumeStock = async (products = []) => {
  for (const item of products) {
    const { stockId, quantity = 1 } = item;
    if (!stockId) throw new Error('Missing stockId in product item');

    const stockItem = await Stock.findById(stockId);
    if (!stockItem) throw new Error(`Stock not found for ID: ${stockId}`);

    if (stockItem.imeiNo) {
      if (stockItem.status === 0) throw new Error(`IMEI-based stock ${stockId} already sold`);
      stockItem.status = 0;
      stockItem.quantity = 0;
    } else {
      if (stockItem.quantity < quantity) {
        throw new Error(`Insufficient quantity in stock for product: ${stockId}. Available: ${stockItem.quantity}, Requested: ${quantity}`);
      }
      stockItem.quantity -= quantity;
      if(stockItem.quantity === 0) stockItem.status = 0;
    }

    await stockItem.save();
  }
};

module.exports = consumeStock;
