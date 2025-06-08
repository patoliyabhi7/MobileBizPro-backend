const Sale = require('../../models/saleModel');
const SaleReturn = require('../../models/saleReturnModel');
const Purchase = require('../../models/purchaseModel');
const { markStockReturnedFromSale } = require('../../utils/markStockReturn');

exports.addSaleReturn = async (req, res) => {
  try {
    const oldSaleId = req.params.saleId;
    const { businessLocation, products = [], totalReturnAmount, paymentStatus = 'due' } = req.body;
    const addedBy = req.user._id;

    if (!oldSaleId || !businessLocation || !products.length) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sale = await Sale.findById(oldSaleId);
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ error: 'Original sale not found' });
    }

    if (sale.businessLocation.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Sale does not belong to the given business location' });
    }

    const inputProductsMap = {};
    for (const item of products) {
      if (!item.productId || typeof item.unitCost !== 'number') {
        return res.status(400).json({ error: 'Each product must include productId and unitCost' });
      }
      inputProductsMap[item.productId] = item.unitCost;
    }

    const matchedSaleProducts = [];
    for (const saleProduct of sale.products) {
      const saleProdIdStr = saleProduct.product.toString();
      if (
        inputProductsMap[saleProdIdStr] !== undefined &&
        !saleProduct.isReturn
      ) {
        matchedSaleProducts.push({
          ...saleProduct.toObject(),
          unitCost: inputProductsMap[saleProdIdStr]
        });
        delete inputProductsMap[saleProdIdStr];
      }
    }

    if (Object.keys(inputProductsMap).length > 0) {
      return res.status(400).json({ error: 'Some products not found in sale or already returned' });
    }

    const returnDate = new Date();

    // Update the sale document — mark specific products as returned
    sale.products = sale.products.map(p => {
      const matched = matchedSaleProducts.find(mp => mp._id.toString() === p._id.toString());
      if (matched) {
        return { ...p.toObject(), isReturn: true, returnDate };
      }
      return p;
    });
    await sale.save();

    // Mark stock as available (status: 1)
    await markStockReturnedFromSale(matchedSaleProducts, sale._id);

    // Create SaleReturn entry
    const saleReturn = await SaleReturn.create({
      originalSale: sale._id,
      businessLocation,
      returnedProducts: matchedSaleProducts.map(p => ({
        product: p.product,
        stockId: p.stockId,
        unitCost: p.unitCost,
        color: p.color,
        storage: p.storage,
        imeiNo: p.imeiNo,
        serialNo: p.serialNo
      })),
      totalReturnAmount,
      paymentStatus,
      paymentDue: totalReturnAmount,
      returnDate,
      addedBy
    });

    // Create Purchase entry (with reused stockIds)
    const purchase = await Purchase.create({
      referenceNo: `RET-SALE-${saleReturn._id}`,
      supplier: sale.customer || null,
      purchaseDate: returnDate,
      businessLocation,
      products: matchedSaleProducts.map(p => ({
        product: p.product,
        stockId: p.stockId,
        color: p.color,
        storage: p.storage,
        imeiNo: p.imeiNo,
        serialNo: p.serialNo,
        unitCost: p.unitCost,
        lineTotal: p.unitCost,
        quantity: 1,
        isSold: false,
        isReturn: true,
        returnDate
      })),
      total: totalReturnAmount,
      paymentStatus,
      paymentDue: totalReturnAmount,
      addedBy,
      createdFromReturn: true,
      saleReturnRef: saleReturn._id
    });

    res.status(201).json({
      message: 'Sale return processed successfully',
      saleReturnId: saleReturn._id,
      purchaseId: purchase._id
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
