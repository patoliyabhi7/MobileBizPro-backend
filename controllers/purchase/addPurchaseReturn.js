const Purchase = require('../../models/purchaseModel');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');

exports.addPurchaseReturn = async (req, res) => {
  try {
    const { purchaseId } = req.params;

    if (!purchaseId) {
      return res.status(400).json({ error: 'purchaseId is required' });
    }

    
    const purchase = await Purchase.findById(purchaseId).lean();
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ error: 'Purchase not found' });
    }
    
    await Purchase.findByIdAndUpdate(purchaseId, { status: 'return' });

    const payments = purchase.payments || [];
    const returnAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    if (returnAmount <= 0) {
      return res.status(400).json({ error: 'No amount received to return' });
    }

    const returnPayments = payments.map(p => ({
      amount: p.amount,
      paidOn: new Date(),
      account: p.account,
      method: p.method,
      note: 'Purchase Return'
    }));

    await updateAccountBalances(returnPayments, 'purchase_return');

    //decrease quantity of products
    if (purchase.products && purchase.products.length > 0) {
      await updateStock(purchase.products, 'decrease');
    }

    res.status(200).json({
      message: 'Purchase return processed successfully',
      returnPayments,
      totalReturnAmount: returnAmount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
