const mongoose = require('mongoose');
const { validatePurchaseReturn } = require('../../utils/validateReturn');
const consumeStock = require('../../utils/consumeStock');
const Purchase = require('../../models/purchaseModel');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');

exports.addPurchaseReturn = async (req, res) => {
  try {
    const { oldPurchaseId } = req.params;
    const { businessLocation, productIds = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(oldPurchaseId)) {
      return res.status(400).json({ error: 'Invalid Purchase ID format' });
    }

    const purchaseId = new mongoose.Types.ObjectId(oldPurchaseId);

    if (!purchaseId || !businessLocation || productIds.length === 0) {
      return res.status(400).json({ error: 'purchaseId, businessLocation, and productIds are required' });
    }

    const purchase = await Purchase.findById(purchaseId);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.businessLocation?.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Purchase does not belong to the given business location' });
    }

    const returnDate = new Date();

    // Filter and validate only selected products
    const returnedProducts = purchase.products.filter(p => productIds.includes(p._id.toString()));

    if (returnedProducts.length === 0) {
      return res.status(400).json({ error: 'No matching products found for return' });
    }

    await validatePurchaseReturn(returnedProducts); // validate only returned ones

    // Mark selected products as returned
    purchase.products = purchase.products.map(p => {
      if (productIds.includes(p._id.toString())) {
        return { ...p.toObject(), isReturn: true, returnDate };
      }
      return p;
    });

    await purchase.save();

    // Return payments based on returned products
    const totalReturnAmount = returnedProducts.reduce((sum, p) => sum + (p.lineTotal || 0), 0);
    const payments = purchase.payments || [];

    const returnPayments = payments.map(p => ({
      amount: p.amount,
      paidOn: returnDate,
      account: p.account,
      method: p.method,
      note: 'Purchase Return'
    }));

    await updateAccountBalances(returnPayments, 'purchase_return');
    await consumeStock(returnedProducts);

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
