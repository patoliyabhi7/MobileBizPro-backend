const Purchase = require('../../models/purchaseModel');
const generateAutoId = require('../../utils/generateAutoId');
const revertStock = require('../../utils/revertStock');
const createStock = require('../../utils/createStock');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');

exports.updatePurchase = async (req, res) => {
  try {
    const oldPurchase = await Purchase.findById(req.params.id);
    if (!oldPurchase || oldPurchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found or deleted' });
    }

    if (req.body.products) {
      let products = typeof req.body.products === 'string' ? JSON.parse(req.body.products) : req.body.products;
      if (!products.every(p => p.quantity === 1)) {
        return res.status(400).json({ error: 'Each product must have quantity = 1' });
      }
      req.body.products = products;
    }

    if (req.files && req.files.length > 0) {
      if (oldPurchase.documents?.length > 0) {
        oldPurchase.documents.forEach(doc => {
          if (fs.existsSync(doc)) fs.unlinkSync(doc);
        });
      }
      req.body.documents = req.files.map(file => `uploads/${file.filename}`);
    }

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

      const paymentRefNo = await generateAutoId('PURPYMNT');
      req.body.payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo
      }));
    }

    req.body.addedBy = req.user.userId;

    // Revert old stock and account balances
    await revertStock(oldPurchase.products);
    await revertAccountBalances(oldPurchase.payments, 'purchase');

    // Update purchase record
    const updatedPurchase = await Purchase.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('addedBy', 'name _id')
      .populate('payments.account')
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .populate('products.product', 'productName')
      .populate('payments.method');

    if (!updatedPurchase) {
      return res.status(404).json({ message: 'Purchase not found after update' });
    }

    // Add new stock and update account balances
    if (req.body.products?.length > 0) {
      await createStock(req.body.products, updatedPurchase._id, updatedPurchase.businessLocation);
    }

    if (req.body.payments?.length > 0) {
      await updateAccountBalances(req.body.payments, 'purchase');
    }

    res.status(200).json({ message: 'Purchase updated successfully', updatedPurchase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
