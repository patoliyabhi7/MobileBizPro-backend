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

    const purchase = await Purchase.findById(purchaseId);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.businessLocation?.toString() !== businessLocation) {
      return res.status(403).json({ error: 'This purchase does not belong to the given business location' });
    }

    const returnDate = new Date();

    // ✅ Update product returnDate & purchase status
    purchase.status = 'return';
    purchase.products = purchase.products.map(p => ({
      ...p.toObject(),
      returnDate
    }));
    await purchase.save();

    const payments = purchase.payments || [];
    let returnPayments = [];
    let totalReturnAmount = 0;

    if (payments.length > 0) {
      totalReturnAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      returnPayments = payments.map(p => ({
        amount: p.amount,
        paidOn: returnDate,
        account: p.account,
        method: p.method,
        note: 'Purchase Return'
      }));

      await updateAccountBalances(returnPayments, 'purchase_return');
    }

    if (purchase.products?.length > 0) {
      await consumeStock(purchase.products);
    }

    res.status(200).json({
      message: 'Purchase return processed successfully',
      returnPayments,
      totalReturnAmount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
