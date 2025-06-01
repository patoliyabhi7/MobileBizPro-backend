const Stock = require('../models/stockModel');

const consumeStock = async (products = []) => {
  for (const item of products) {
    // Build the query based on unique identifiers
    const query = {
      status: 1, // only available stock
      $or: []
    };

    if (item.stockId) {
      query._id = item.stockId;
      delete query.$or; // exact match by ID, no need for OR
    } else {
      if (item.imeiNo) query.$or.push({ imeiNo: item.imeiNo });
      if (item.serialNo) query.$or.push({ serialNo: item.serialNo });
      if (query.$or.length === 0 && item.product) {
        query.$or.push({ product: item.product });
      }
    }

    const stockItem = await Stock.findOne(query);

    if (!stockItem) {
      throw new Error(`Stock unavailable or already consumed for: ${item.product || item.stockId || item.imeiNo || item.serialNo}`);
    }

    stockItem.status = 0; // mark as used
    await stockItem.save();
  }
};

module.exports = consumeStock;
