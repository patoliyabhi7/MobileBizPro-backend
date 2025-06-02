const Stock = require('../models/stockModel');

const consumeStock = async (products = []) => {
  for (const item of products) {
    let query = { status: 1 }; // only available items

    if (item.imeiNo) {
      query.imeiNo = item.imeiNo;
    } else {
      // fallback if IMEI is missing
      query.product = item.product;
      if (item.color) query.color = item.color;
      if (item.storage) query.storage = item.storage;
    }

    console.log("🔍 consumeStock query:", query);

    const stockItem = await Stock.findOne(query);

    if (!stockItem) {
      throw new Error(`Stock unavailable or already consumed for item: ${JSON.stringify(item)}`);
    }

    stockItem.status = 0; // mark as used
    await stockItem.save();
  }
};

module.exports = consumeStock;
