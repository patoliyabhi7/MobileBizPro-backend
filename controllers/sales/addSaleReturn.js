const mongoose = require('mongoose');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { markStockReturnedFromSale } = require('../../utils/markStockReturn');
const Sale = require('../../models/saleModel');
const SaleReturn = require('../../models/saleReturnModel');

exports.addSaleReturn = async (req, res) => {
  try {
    const { oldSaleId } = req.params;
    const { businessLocation, productIds = [], returnPayments = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(oldSaleId)) {
      return res.status(400).json({ error: 'Invalid Sale ID format' });
    }

    if (!businessLocation || productIds.length === 0) {
      return res.status(400).json({ error: 'businessLocation and productIds are required' });
    }

    const sale = await Sale.findById(oldSaleId);
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.businessLocation?.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Sale does not belong to the given business location' });
    }

    const returnDate = new Date();

    const returnedProducts = sale.products.filter(p => productIds.includes(p._id.toString()));
    if (returnedProducts.length === 0) {
      return res.status(400).json({ error: 'No matching products found for return' });
    }

    sale.products = sale.products.map(p => {
      if (productIds.includes(p._id.toString())) {
        return { ...p.toObject(), isReturn: true, returnDate };
      }
      return p;
    });
    await sale.save();

    const totalReturnAmount = returnedProducts.reduce((sum, p) => sum + (p.lineTotal || 0), 0);

    await markStockReturnedFromSale(returnedProducts, businessLocation);
    await updateAccountBalances(returnPayments, 'sale_return');

    await SaleReturn.create({
      originalSale: sale._id,
      businessLocation,
      returnedProducts: returnedProducts.map(p => ({
        product: p.product,
        imeiNo: p.imeiNo,
        color: p.color,
        storage: p.storage,
        lineTotal: p.lineTotal,
        note: p.note
      })),
      totalReturnAmount,
      returnDate,
      returnPayments,
      addedBy: req.user?._id
    });

    res.status(200).json({
      message: 'Products returned successfully',
      totalReturnAmount,
      returnPayments
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
