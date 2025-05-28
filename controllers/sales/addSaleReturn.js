const Sale = require('../../models/saleModel');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');

exports.addSaleReturn = async (req, res) => {
  try {
    const { saleId } = req.params;

    if (!saleId) {
      return res.status(400).json({ error: 'saleId is required' });
    }

    
    const sale = await Sale.findById(saleId).lean();
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
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

    await updateAccountBalances(returnPayments, 'sale_return');

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
