const mongoose = require('mongoose');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { markStockReturnedFromSale } = require('../../utils/markStockReturn');
const Sale = require('../../models/saleModel');
const SaleReturn = require('../../models/saleReturnModel');
const Purchase = require('../../models/purchaseModel');
const generateAutoId = require('../../utils/generateAutoId');

exports.addSaleReturn = async (req, res) => {
  try {
    const { oldSaleId } = req.params;
    const { businessLocation, products = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(oldSaleId)) {
      return res.status(400).json({ error: 'Invalid Sale ID format' });
    }

    if (!businessLocation || products.length === 0) {
      return res.status(400).json({ error: 'businessLocation and products are required' });
    }

    const sale = await Sale.findById(oldSaleId);
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.businessLocation.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Sale does not belong to the given business location' });
    }

    const returnDate = new Date();

    const productMap = {};
    for (let item of products) {
      if (!item.productId || !item.unitCost) {
        return res.status(400).json({ error: 'Each product must include productId and unitCost' });
      }
      productMap[item.productId] = item.unitCost;
    }

    const returnedProducts = sale.products.filter(p => productMap[p._id.toString()]);
    if (returnedProducts.length === 0) {
      return res.status(400).json({ error: 'No matching products found for return' });
    }

    // Update original sale with return flag
    sale.products = sale.products.map(p => {
      if (productMap[p._id.toString()]) {
        return { ...p.toObject(), isReturn: true, returnDate };
      }
      return p;
    });
    await sale.save();

    await markStockReturnedFromSale(returnedProducts, sale._id);

    const refNo = await generateAutoId('SALERET');

    const enrichedReturnedProducts = returnedProducts.map(p => ({
      product: p.product,
      imeiNo: p.imeiNo,
      color: p.color,
      storage: p.storage,
      lineTotal: productMap[p._id.toString()],
      unitCost: productMap[p._id.toString()],
      note: p.note
    }));

    const totalReturnAmount = enrichedReturnedProducts.reduce((sum, p) => sum + p.lineTotal, 0);

    const saleReturn = await SaleReturn.create({
      originalSale: sale._id,
      businessLocation,
      referenceNo: refNo,
      returnedProducts: enrichedReturnedProducts,
      totalReturnAmount,
      returnDate,
      returnPayments: [],
      addedBy: req.user?._id
    });

    // Create Purchase
    const purchaseProducts = returnedProducts.map(p => ({
      product: p.product,
      imeiNo: p.imeiNo,
      color: p.color,
      storage: p.storage,
      lineTotal: productMap[p._id.toString()],
      unitCost: productMap[p._id.toString()],
      quantity: 1,
      returnDate,
      stockId: p.stockId,
      note: '[Auto-generated from Sale Return]'
    }));

    const newPurchase = await Purchase.create({
      referenceNo: refNo,
      businessLocation,
      supplier: sale.customer,
      products: purchaseProducts,
      purchaseDate: returnDate,
      paymentStatus: 'due',
      status: 'received',
      total: totalReturnAmount,
      paymentDue: totalReturnAmount,
      createdFromReturn: true,
      saleReturnRef: saleReturn._id,
      addedBy: req.user?._id
    });

    res.status(200).json({
      message: 'Sale return recorded and purchase created successfully',
      totalReturnAmount,
      purchaseId: newPurchase._id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

