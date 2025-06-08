const Stock = require('../models/stockModel');

const consumeStock = async (products = []) => {
  for (const item of products) {
    const stockId = item.stockId;
    if (!stockId) {
      throw new Error('Missing stockId in product item');
    }

    const stockItem = await Stock.findById(stockId);

    if (!stockItem || stockItem.status === 0) {
      throw new Error(`Stock already consumed or not found for ID: ${stockId}`);
    }

    stockItem.status = 0; // Mark as used/sold
    await stockItem.save();
  }
};

// const consumeStock = async (products = []) => {
//   for (const item of products) {
//     let query = { status: 1 }; // only available items

//     if (item.imeiNo) {
//       query.imeiNo = item.imeiNo;
//     } else {
//       // fallback if IMEI is missing
//       query.product = item.product;
//       if (item.color) query.color = item.color;
//       if (item.storage) query.storage = item.storage;
//     }

//     const stockItem = await Stock.findOne(query);

//     if (!stockItem) {
//       throw new Error(`Stock unavailable or already consumed for item: ${JSON.stringify(item)}`);
//     }

//     stockItem.status = 0; // mark as used
//     await stockItem.save();
//   }
// };

module.exports = consumeStock;
