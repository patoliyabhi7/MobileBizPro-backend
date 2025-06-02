const Stock = require('../models/stockModel');

const revertStock = async (products = []) => {
  for (const item of products) {
    let query = {};

    if (item.imeiNo) {
      query.imeiNo = item.imeiNo;
    } else {
      // fallback if IMEI is missing
      query.product = item.product;
      if (item.color) query.color = item.color;
      if (item.storage) query.storage = item.storage;
    }

    console.log("♻️ revertStock query:", query);

    const stockItem = await Stock.findOne(query);

    if (stockItem) {
      stockItem.status = 1; // mark as available
      await stockItem.save();
    }
  }
};

module.exports = revertStock;
