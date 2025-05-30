const Sale = require('../../models/saleModel');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const revertStock = require('../../utils/revertStock');

exports.addSaleReturn = async (req, res) => {
  try {
    const { saleId } = req.params;
    const { businessLocation } = req.body;

    if (!saleId || !businessLocation) {
      return res.status(400).json({ error: 'saleId and businessLocation are required' });
    }

    const sale = await Sale.findById(saleId).lean();
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.businessLocation?.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Sale does not belong to this business location' });
    }

    // 🔁 Mark as returned
    await Sale.findByIdAndUpdate(saleId, { status: 'return' });

    const payments = sale.payments || [];
    const returnAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    if (returnAmount <= 0) {
      return res.status(400).json({ error: 'No amount received to return' });
    }

    const returnPayments = payments.map(p => ({
      amount: p.amount,
      paidOn: new Date(),
      account: p.account,
      method: p.method,
      note: 'Sale Return'
    }));

    // 💰 Reverse payments
    await updateAccountBalances(returnPayments, 'sale_return');

    // 📦 Revert stock
    await revertStock(sale.products, businessLocation);

    res.status(200).json({
      message: 'Sale return processed successfully',
      returnPayments,
      totalReturnAmount: returnAmount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
