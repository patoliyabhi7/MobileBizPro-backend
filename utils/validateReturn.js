const Stock = require('../models/stockModel');

exports.validatePurchaseReturn = async (products = []) => {
  for (const item of products) {
    if (!item.imeiNo) {
      throw new Error(`IMEI is required for each product to process a return.`);
    }
    console.log(item.imeiNo);

    const stock = await Stock.findOne({ imeiNo: item.imeiNo });
    console.log(stock);
    if (!stock || stock.status === 0) {
      throw new Error(`Cannot return product with IMEI ${item.imeiNo} because it's already sold or not available in stock.`);
    }
  }
};

exports.validateSaleReturn = async (products = []) => {
  // Optional: Add rules like not allowing multiple returns of same item
  return true;
};
