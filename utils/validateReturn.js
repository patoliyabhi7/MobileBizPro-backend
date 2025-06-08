const Stock = require('../models/stockModel');

exports.validatePurchaseReturn = async (products = []) => {
  for (const item of products) {
    const stockId = item.stockId;
    if (!stockId) throw new Error('stockId is required for each product');

    const stock = await Stock.findById(stockId);

    if (!stock || stock.status === 0) {
      throw new Error(`Cannot return product with stockId ${stockId} because it's already sold or not found.`);
    }
  }
};

exports.validateSaleReturn = async (products = []) => {
  // Optional: Add rules like not allowing multiple returns of same item
  return true;
};
