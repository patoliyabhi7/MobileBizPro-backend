const Stock = require('../models/stockModel');


const revertStock = async (products = []) => {
  for (const item of products) {
    const stockId = item.stockId;
    if (!stockId) continue;

    const stockItem = await Stock.findById(stockId);

    if (stockItem) {
      stockItem.status = 1; // Mark as available again
      await stockItem.save();
    }
  }
};


// const revertStock = async (products = []) => {
//   for (const item of products) {
//     let query = {};

//     if (item.imeiNo) {
//       query.imeiNo = item.imeiNo;
//     } else {
//       // fallback if IMEI is missing
//       query.product = item.product;
//       if (item.color) query.color = item.color;
//       if (item.storage) query.storage = item.storage;
//     }

//     const stockItem = await Stock.findOne(query);

//     if (stockItem) {
//       stockItem.status = 1; // mark as available
//       await stockItem.save();
//     }
//   }
// };

module.exports = revertStock;
