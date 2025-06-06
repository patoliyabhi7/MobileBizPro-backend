const Stock = require('../models/stockModel');
const Purchase = require('../models/purchaseModel');

const markStockReturnedFromSale = async (products = [], businessLocation) => {
  for (const item of products) {
    const stockItem = await Stock.findOne({
      imeiNo: item.imeiNo,
      status: 0,
      businessLocation
    });

    if (stockItem) {
      stockItem.status = 1;
      await stockItem.save();
    }

    // Reset sold flag
    await Purchase.updateOne(
      { 'products.imeiNo': item.imeiNo },
      {
        $set: {
          'products.$.isSold': false,
          'products.$.returnDate': new Date()
        }
      }
    );
  }
};

module.exports = { markStockReturnedFromSale };
