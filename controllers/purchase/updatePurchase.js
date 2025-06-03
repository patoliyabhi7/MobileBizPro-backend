const Purchase = require('../../models/purchaseModel');
const generateAutoId = require('../../utils/generateAutoId');
const revertStock = require('../../utils/revertStock');
const createStock = require('../../utils/createStock');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const fs = require('fs');

exports.updatePurchase = async (req, res) => {
  try {
    const oldPurchase = await Purchase.findById(req.params.id);
    if (!oldPurchase || oldPurchase.isDeleted) {
      return res.status(404).json({ message: 'Purchase not found or deleted' });
    }

    // 👇 Validate & parse products
    if (req.body.products) {
      let products = typeof req.body.products === 'string'
        ? JSON.parse(req.body.products)
        : req.body.products;

      if (!products.every(p => p.quantity === 1)) {
        return res.status(400).json({ error: 'Each product must have quantity = 1' });
      }

      req.body.products = products;
    }


    // 👇 Handle document replacement
    if (req.files?.length > 0) {
      if (oldPurchase.documents?.length > 0) {
        oldPurchase.documents.forEach(doc => {
          if (fs.existsSync(doc)) fs.unlinkSync(doc);
        });
      }
      req.body.documents = req.files.map(file => `uploads/${file.filename}`);
    }

    // 👇 Handle payments
    let newPayments = [];
    if ('payments' in req.body) {
      if (typeof req.body.payments === 'string') {
        try {
          newPayments = JSON.parse(req.body.payments);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid payments format' });
        }
      } else if (Array.isArray(req.body.payments)) {
        newPayments = req.body.payments;
      }

      const newRefNo = await generateAutoId('PURPYMNT');
      newPayments = newPayments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: newRefNo
      }));

      req.body.payments = newPayments;
    }

    req.body.addedBy = req.user.userId;

    // 👇 Revert only unsold products
    const unsoldOldProducts = oldPurchase.products?.filter(p => !p.isSold) || [];
    if (unsoldOldProducts.length > 0) {
      await revertStock(unsoldOldProducts);
    }

    await revertAccountBalances(oldPurchase.payments || [], 'purchase');

    // 👇 Update purchase
    const updatedPurchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
      .populate('addedBy', 'name _id')
      .populate('payments.account')
      .populate('payments.method')
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .populate('products.product', 'productName');

    if (!updatedPurchase) {
      return res.status(404).json({ message: 'Purchase not found after update' });
    }

    // 👇 Recreate stock for only unsold new products
    const newUnsoldProducts = req.body.products?.filter(p => !p.isSold) || [];
    if (newUnsoldProducts.length > 0) {
      await createStock(newUnsoldProducts, updatedPurchase._id, updatedPurchase.businessLocation);
    }

    // 👇 Reapply payments
    if (updatedPurchase.payments?.length > 0) {
      await updateAccountBalances(updatedPurchase.payments, 'purchase');
    }

    res.status(200).json({ message: 'Purchase updated successfully', updatedPurchase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
