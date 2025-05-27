const Purchase = require('../../models/purchaseModel');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');

exports.updatePurchase = async (req, res) => {
  try {
    // Step 1: Fetch the old purchase for reverting old balances
    const oldPurchase = await Purchase.findById(req.params.id);
    if (!oldPurchase || oldPurchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found or deleted' });
    }

    // Step 2: Handle document upload and replace old ones
    if (req.files && req.files.length > 0) {
      // Delete existing files
      if (oldPurchase.documents && oldPurchase.documents.length > 0) {
        oldPurchase.documents.forEach(doc => {
          if (fs.existsSync(doc)) fs.unlinkSync(doc);
        });
      }

      // Assign new file paths
      req.body.documents = req.files.map(file => `uploads/${file.filename}`);
    }

    // Step 3: Parse and format payments
    if ('payments' in req.body) {
      let payments = [];

      if (typeof req.body.payments === 'string') {
        try {
          payments = JSON.parse(req.body.payments);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid payments format' });
        }
      } else if (Array.isArray(req.body.payments)) {
        payments = req.body.payments;
      }

      // Format date strings into Date objects
      payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
      }));

      req.body.payments = payments;
    }

    req.body.addedBy = req.user.userId;

    // Step 4: Revert old account balances
    await revertAccountBalances(oldPurchase.payments, 'purchase');

    // Step 5: Update purchase
    const updatedPurchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('addedBy', 'name _id').populate('payments.account').populate('supplier', 'businessName firstName lastName')
    .populate('businessLocation', 'name')
    .populate('products.product', 'productName');

    if (!updatedPurchase) {
      return res.status(404).json({ message: 'Purchase not found after update' });
    }

    // Step 6: Apply new payment balances
    if (req.body.payments && req.body.payments.length > 0) {
      await updateAccountBalances(req.body.payments, 'purchase');
    }

    res.status(200).json({ message: 'Purchase updated successfully', updatedPurchase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
