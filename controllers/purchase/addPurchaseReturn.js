const Purchase = require('../../models/purchaseModel');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const consumeStock = require('../../utils/consumeStock');

exports.addPurchaseReturn = async (req, res) => {
  try {
    const { purchaseId } = req.params;
    const { businessLocation } = req.body;

    if (!purchaseId || !businessLocation) {
      return res.status(400).json({ error: 'purchaseId and businessLocation are required' });
    }

    const purchase = await Purchase.findById(purchaseId).lean();
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.businessLocation?.toString() !== businessLocation) {
      return res.status(403).json({ error: 'This purchase does not belong to the given business location' });
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

    // 👇 Update account balances for the return
    await updateAccountBalances(returnPayments, 'purchase_return');

    // 👇 Mark related stock as consumed
    if (purchase.products?.length > 0) {
      await consumeStock(purchase.products);
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
