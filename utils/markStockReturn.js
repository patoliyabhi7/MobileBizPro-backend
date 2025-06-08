const Stock = require('../models/stockModel');
const Purchase = require('../models/purchaseModel');

const markStockReturnedFromSale = async (products = [], saleId) => {
  for (const item of products) {
    const stockId = item.stockId;
    if (!stockId) continue;

    const stockItem = await Stock.findById(stockId);
    if (stockItem) {
      stockItem.status = 1; // Back to available
      await stockItem.save();
    }

    await Sale.updateOne(
      { _id: saleId, "products.stockId": stockId },
      {
        $set: {
          "products.$.isReturn": true,
          "products.$.returnDate": new Date()
        }
      }
    );
  }
};

// const markStockReturnedFromSale = async (products = [], businessLocation) => {
//   for (const item of products) {
//     const stockItem = await Stock.findOne({
//       imeiNo: item.imeiNo,
//       status: 0,
//       businessLocation
//     });

//     if (stockItem) {
//       stockItem.status = 1;
//       await stockItem.save();
//     }

//     // Reset sold flag
//     await Purchase.updateOne(
//       { 'products.imeiNo': item.imeiNo },
//       {
//         $set: {
//           'products.$.isSold': false,
//           'products.$.returnDate': new Date()
//         }
//       }
//     );
//   }
// };

module.exports = { markStockReturnedFromSale };
