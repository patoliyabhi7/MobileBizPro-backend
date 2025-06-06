const mongoose = require('mongoose');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { markStockReturnedFromSale } = require('../../utils/markStockReturn');
const Sale = require('../../models/saleModel');

exports.addSaleReturn = async (req, res) => {
  try {
    const { oldSaleId } = req.params;
    const { businessLocation, productIds = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(oldSaleId)) {
      return res.status(400).json({ error: 'Invalid Sale ID format' });
    }

    const saleId = new mongoose.Types.ObjectId(oldSaleId);

    if (!saleId || !businessLocation || productIds.length === 0) {
      return res.status(400).json({ error: 'saleId, businessLocation, and productIds are required' });
    }

    const sale = await Sale.findById(saleId);
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

    // Update only returned products
    sale.products = sale.products.map(p => {
      if (productIds.includes(p._id.toString())) {
        return { ...p.toObject(), isReturn: true, returnDate };
      }
      return p;
    });

    await sale.save();

    // Payment refund for only selected returned products
    const totalReturnAmount = returnedProducts.reduce((sum, p) => sum + (p.lineTotal || 0), 0);
    const payments = sale.payments || [];

    const returnPayments = payments.map(p => ({
      amount: p.amount,
      paidOn: returnDate,
      account: p.account,
      method: p.method,
      note: 'Sale Return'
    }));

    await updateAccountBalances(returnPayments, 'sale_return');
    await markStockReturnedFromSale(returnedProducts, businessLocation);

    res.status(200).json({
      message: 'Selected products returned successfully',
      returnPayments,
      totalReturnAmount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

