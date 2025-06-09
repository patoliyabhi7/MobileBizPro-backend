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

    if (oldPurchase.createdFromReturn) {
      if ('products' in req.body) {
        return res.status(400).json({
          error: 'Cannot update products of a sale return purchase. Only payments and documents can be updated.'
        });
      }

      if (req.files?.length > 0) {
        if (oldPurchase.documents?.length > 0) {
          oldPurchase.documents.forEach(doc => {
            if (fs.existsSync(doc)) fs.unlinkSync(doc);
          });
        }
        req.body.documents = req.files.map(file => `uploads/${file.filename}`);
      }

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

        await revertAccountBalances(oldPurchase.payments || [], 'purchase');
        await updateAccountBalances(newPayments, 'purchase');
      }

      req.body.addedBy = req.user.userId;

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

      return res.status(200).json({
        message: 'Sale return purchase payment updated successfully',
        updatedPurchase
      });
    }

    let updatedProducts = [];
    if (req.body.products) {
      updatedProducts = typeof req.body.products === 'string'
        ? JSON.parse(req.body.products)
        : req.body.products;

      if (!updatedProducts.every(p => p.quantity === 1)) {
        return res.status(400).json({ error: 'Each product must have quantity = 1' });
      }
    }

    const soldProducts = oldPurchase.products?.filter(p => p.isSold) || [];
    const returnedProducts = oldPurchase.products?.filter(p => p.isReturn) || [];

    const returnedStockIds = returnedProducts.map(p => String(p.stockId));
    const updatedStockIds = updatedProducts.map(p => String(p.stockId));

    for (const returned of returnedProducts) {
      if (!updatedStockIds.includes(String(returned.stockId))) {
        return res.status(400).json({
          error: `Cannot remove returned product with stock ID: ${returned.stockId}`
        });
      }
    }

    const triedToModifyReturned = updatedProducts.some(p => {
      return returnedStockIds.includes(String(p.stockId)) &&
        !returnedProducts.some(rp =>
          String(rp.stockId) === String(p.stockId) &&
          rp.product.toString() === p.product &&
          rp.color === p.color &&
          rp.storage === p.storage &&
          rp.lineTotal === p.lineTotal
        );
    });

    if (triedToModifyReturned) {
      return res.status(400).json({ error: 'Cannot modify details of returned products' });
    }

    for (const sold of soldProducts) {
      if (!updatedStockIds.includes(String(sold.stockId))) {
        return res.status(400).json({
          error: `Cannot remove or modify sold product with stock ID: ${sold.stockId}`
        });
      }
    }

    const removedUnsold = oldPurchase.products?.filter(p =>
      !p.isSold &&
      !p.isReturn &&
      !updatedStockIds.includes(String(p.stockId))
    ) || [];

    if (removedUnsold.length > 0) {
      await revertStock(removedUnsold);
    }

    if (req.files?.length > 0) {
      if (oldPurchase.documents?.length > 0) {
        oldPurchase.documents.forEach(doc => {
          if (fs.existsSync(doc)) fs.unlinkSync(doc);
        });
      }
      req.body.documents = req.files.map(file => `uploads/${file.filename}`);
    }

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

    await revertAccountBalances(oldPurchase.payments || [], 'purchase');

    const newUnsoldProducts = updatedProducts.filter(p =>
      !oldPurchase.products?.some(op => String(op.stockId) === String(p.stockId))
    );

    if (newUnsoldProducts.length > 0) {
      await createStock(
        newUnsoldProducts,
        oldPurchase._id,
        oldPurchase.businessLocation
      );
    }

    const finalProducts = [
      ...soldProducts,
      ...returnedProducts,
      ...updatedProducts.filter(p =>
        !soldProducts.some(sp => String(sp.stockId) === String(p.stockId)) &&
        !returnedProducts.some(rp => String(rp.stockId) === String(p.stockId))
      )
    ];

    req.body.products = finalProducts;

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

    if (updatedPurchase.payments?.length > 0) {
      await updateAccountBalances(updatedPurchase.payments, 'purchase');
    }

    res.status(200).json({
      message: 'Purchase updated successfully',
      updatedPurchase
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
