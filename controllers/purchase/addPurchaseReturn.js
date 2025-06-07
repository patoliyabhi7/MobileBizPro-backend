const mongoose = require('mongoose');
const { validatePurchaseReturn } = require('../../utils/validateReturn');
const consumeStock = require('../../utils/consumeStock');
const Purchase = require('../../models/purchaseModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');

exports.addPurchaseReturn = async (req, res) => {
  try {
    const { oldPurchaseId } = req.params;
    const { businessLocation, productIds = [], returnPayments = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(oldPurchaseId)) {
      return res.status(400).json({ error: 'Invalid Purchase ID format' });
    }

    const purchaseId = new mongoose.Types.ObjectId(oldPurchaseId);

    if (!businessLocation || productIds.length === 0) {
      return res.status(400).json({ error: 'businessLocation and productIds are required' });
    }

    const purchase = await Purchase.findById(purchaseId);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    if (purchase.businessLocation?.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Purchase does not belong to the given business location' });
    }

    const returnDate = new Date();

    const returnedProducts = purchase.products.filter(p => productIds.includes(p._id.toString()));
    if (returnedProducts.length === 0) {
      return res.status(400).json({ error: 'No matching products found for return' });
    }

    await validatePurchaseReturn(returnedProducts);

    // Update flags only for returned products
    purchase.products = purchase.products.map(p => {
      if (productIds.includes(p._id.toString())) {
        return { ...p.toObject(), isReturn: true, returnDate };
      }
      return p;
    });
    await purchase.save();

    const totalReturnAmount = returnedProducts.reduce((sum, p) => sum + (p.lineTotal || 0), 0);

    await consumeStock(returnedProducts);

    // Record and update return payments separately
    await updateAccountBalances(returnPayments, 'purchase_return');

    await PurchaseReturn.create({
      originalPurchase: purchase._id,
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
