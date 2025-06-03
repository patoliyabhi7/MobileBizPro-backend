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
    let updatedProducts = [];
    if (req.body.products) {
      updatedProducts = typeof req.body.products === 'string'
        ? JSON.parse(req.body.products)
        : req.body.products;

      if (!updatedProducts.every(p => p.quantity === 1)) {
        return res.status(400).json({ error: 'Each product must have quantity = 1' });
      }
    }

    // 👇 Prevent sold product modification
    const soldProducts = oldPurchase.products?.filter(p => p.isSold) || [];
    for (const sold of soldProducts) {
      if (!updatedProducts.some(p => p.imeiNo === sold.imeiNo)) {
        return res.status(400).json({ error: `Cannot remove or modify sold product with IMEI: ${sold.imeiNo}` });
      }
    }

    // 👇 Revert stock of removed unsold products
    const updatedImeis = updatedProducts.map(p => p.imeiNo);
    const removedUnsoldProducts = oldPurchase.products?.filter(
      p => !p.isSold && !updatedImeis.includes(p.imeiNo)
    ) || [];

    if (removedUnsoldProducts.length > 0) {
      await revertStock(removedUnsoldProducts);
    }

    // 👇 Create list of final merged products
    const finalProducts = [
      ...soldProducts,
      ...updatedProducts.filter(p => !soldProducts.some(sp => sp.imeiNo === p.imeiNo))
    ];

    req.body.products = finalProducts;

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

    // 👇 Revert account balances
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

    // 👇 Create stock only for newly added unsold products
    const newlyAddedUnsold = updatedProducts.filter(p => {
      const alreadyExists = oldPurchase.products?.some(op => op.imeiNo === p.imeiNo);
      return !alreadyExists;
    });

    if (newlyAddedUnsold.length > 0) {
      await createStock(newlyAddedUnsold, updatedPurchase._id, updatedPurchase.businessLocation);
    }

    // 👇 Reapply updated payments
    if (updatedPurchase.payments?.length > 0) {
      await updateAccountBalances(updatedPurchase.payments, 'purchase');
    }

    res.status(200).json({ message: 'Purchase updated successfully', updatedPurchase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
