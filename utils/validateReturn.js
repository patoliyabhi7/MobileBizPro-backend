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
  for (const item of products) {
    if (!item.stockId) throw new Error('stockId is required for each returned product');

    const stock = await Stock.findById(item.stockId);
    if (!stock) {
      throw new Error(`Stock not found for stockId: ${item.stockId}`);
    }

    if (stock.status === 1) {
      // Already available → this means it's already returned or never sold
      throw new Error(`Stock with ID ${item.stockId} is already available. Cannot return twice.`);
    }
  }
  return true;
};
