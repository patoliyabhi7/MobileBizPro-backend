const Stock = require('../models/stockModel');

// Called when creating a Purchase: generate new stock entries for each unit
const createStock = async (products = [], purchaseId, businessLocationId) => {
  for (const item of products) {
    if (!item.product) {
      throw new Error('Missing product reference in one of the stock items.');
    }

    const stock = new Stock({
      product: item.product,
      serialNo: item.serialNo || null,
      imeiNo: item.imeiNo || null,
      color: item.color || null,
      storage: item.storage || null,
      purchaseRef: purchaseId,
      businessLocation: businessLocationId,
      status: 1, // available
      gstApplicable: item.gstApplicable || false,
      gstPercentage: item.gstPercentage || 18
    });

    await stock.save();

    // Attach stockId back to item (optional, if you want to use it after create)
    item.stockId = stock._id;
  }

  return products; // return with attached stockId if needed
};

// const createStock = async (products = [], purchaseId, businessLocationId) => {
//   for (const item of products) {
//     // Avoid duplicates by IMEI or serial
//     const exists = await Stock.findOne({
//       $or: [
//         { imeiNo: item.imeiNo || null },
//         { serialNo: item.serialNo || null }
//       ].filter(cond => Object.values(cond)[0] !== null)
//     });
//     if (exists) continue;

//     const stock = new Stock({
//       product: item.product,
//       serialNo: item.serialNo,
//       imeiNo: item.imeiNo,
//       color: item.color,
//       storage: item.storage,
//       purchaseRef: purchaseId,
//       businessLocation: businessLocationId,
//       status: 1
//     });

//     await stock.save();
//   }
// };

module.exports = createStock;
