const Stock = require('../models/stockModel');

const revertStock = async (products) => {
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

    if (stockItem) {
      stockItem.status = 1; // back to available
      await stockItem.save();
    }
  }
};

module.exports = revertStock;
