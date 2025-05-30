const Stock = require('../models/stockModel');

const consumeStock = async (products) => {
  for (const item of products) {
    const query = {
      $or: [],
    };

    if (item.imeiNo) query.$or.push({ imeiNo: item.imeiNo });
    if (item.serialNo) query.$or.push({ serialNo: item.serialNo });

    if (query.$or.length === 0 && item.product) {
      query.$or.push({ product: item.product });
    }

    const stockItem = await Stock.findOne(query);

    if (stockItem && stockItem.status === 1) {
      stockItem.status = 0; // used
      await stockItem.save();
    } else {
      throw new Error(`Stock unavailable or already consumed: ${item.product}`);
    }
  }
};

module.exports = consumeStock;
