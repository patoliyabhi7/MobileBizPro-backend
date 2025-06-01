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

    const sale = await Sale.findById(saleId);
    if (!sale || sale.isDeleted) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.businessLocation?.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Sale does not belong to this business location' });
    }

    const returnDate = new Date();

    sale.status = 'return';
    sale.products.forEach(prod => {
      prod.returnDate = returnDate;
    });
    await sale.save();

    const payments = sale.payments || [];
    let returnPayments = [];
    let totalReturnAmount = 0;

    if (payments.length > 0) {
      totalReturnAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      returnPayments = payments.map(p => ({
        amount: p.amount,
        paidOn: returnDate,
        account: p.account,
        method: p.method,
        note: 'Sale Return'
      }));

      await updateAccountBalances(returnPayments, 'sale_return');
    }

    if (sale.products?.length > 0) {
      await revertStock(sale.products, businessLocation);
    }

    res.status(200).json({
      message: 'Sale return processed successfully',
      returnPayments,
      totalReturnAmount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
