const Stock = require('../models/stockModel');

const createStock = async (products, purchaseId, businessLocationId) => {
    for (const item of products) {
        const exists = await Stock.findOne({
            $or: [{ imeiNo: item.imeiNo }, { serialNo: item.serialNo }]
        });
        if (exists) continue;

        const stock = new Stock({
            product: item.product,
            serialNo: item.serialNo,
            imeiNo: item.imeiNo,
            color: item.color,
            storage: item.storage,
            purchaseRef: purchaseId,
            businessLocation: businessLocationId,
            status: 1
        });

        await stock.save();
    }
};

module.exports = createStock;
