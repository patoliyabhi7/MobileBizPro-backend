const PurchaseReturn = require('../../models/purchaseReturnModel');
const generateAutoId = require('../../utils/generateAutoId');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');

exports.updatePurchaseReturn = async (req, res) => {
  try {
    const purchaseReturnId = req.params.id;

    const oldPurchaseReturn = await PurchaseReturn.findById(purchaseReturnId);
    if (!oldPurchaseReturn) {
      return res.status(404).json({ message: 'Purchase return not found' });
    }

    // Revert old payments from account balances
    await revertAccountBalances(oldPurchaseReturn.returnPayments || [], 'purchase_return');

    // Format new payments
    let newPayments = Array.isArray(req.body.returnPayments) ? req.body.returnPayments : [];

    if (newPayments.length > 0) {
      const newRefNo = await generateAutoId('PURRETPYMT');
      newPayments = newPayments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: newRefNo,
        amount: Number(p.amount || 0)
      }));
    }

    req.body.returnPayments = newPayments;

    // Add `addedBy` from token if not present
    req.body.addedBy = req.user?.userId || oldPurchaseReturn.addedBy;

    // Payment status and payment due are taken from frontend
    // req.body.paymentStatus = req.body.paymentStatus || oldPurchaseReturn.paymentStatus;
    // req.body.paymentDue = req.body.paymentDue || oldPurchaseReturn.paymentDue;

    // Update purchase return document
    const updatedPurchaseReturn = await PurchaseReturn.findByIdAndUpdate(
      purchaseReturnId,
      req.body,
      { new: true }
    )
      .populate('originalPurchase', 'invoiceNo supplier')
      .populate('businessLocation', 'name')
      .populate('returnPayments.account', 'name accountNumber')
      .populate('returnPayments.method', 'name')
      .populate('addedBy', 'name');

    if (!updatedPurchaseReturn) {
      return res.status(404).json({ message: 'Purchase return not found after update' });
    }

    // Update account balances with new payments
    if (newPayments.length > 0) {
      await updateAccountBalances(newPayments, 'purchase_return');
    }

    res.status(200).json({
      message: 'Purchase return updated successfully',
      updatedPurchaseReturn
    });
  } catch (err) {
    console.error('Update Purchase Return Error:', err);
    res.status(500).json({ error: err.message });
  }
};