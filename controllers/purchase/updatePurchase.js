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

    // If purchase is created from sale return, restrict product updates
    if (oldPurchase.createdFromReturn) {
      if ('products' in req.body) {
        return res.status(400).json({
          error: 'Cannot update products of a sale return purchase. Only payments and documents can be updated.'
        });
      }

      // Handle documents update (delete old, add new)
      if (req.files?.length > 0) {
        if (oldPurchase.documents?.length > 0) {
          oldPurchase.documents.forEach(doc => {
            if (fs.existsSync(doc)) fs.unlinkSync(doc);
          });
        }
        req.body.documents = req.files.map(file => `uploads/${file.filename}`);
      }

      // Handle payments update
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

    // Parse updated products array from request
    let updatedProducts = [];
    if (req.body.products) {
      updatedProducts = typeof req.body.products === 'string'
        ? JSON.parse(req.body.products)
        : req.body.products;

      // Fill missing stockId from oldPurchase.products by matching keys
      updatedProducts = updatedProducts.map(up => {
        if (!up.stockId) {
          const match = oldPurchase.products.find(op =>
            op.product.toString() === up.product &&
            op.color === up.color &&
            op.storage === up.storage &&
            (op.imeiNo === up.imeiNo || op.serialNo === up.serialNo)
          );
          if (match) {
            up.stockId = match.stockId;
          }
        }
        return up;
      });

      // Validate that all products now have valid stockId
      const missingStockId = updatedProducts.find(p => !p.stockId);
      if (missingStockId) {
        return res.status(400).json({ error: 'Each product must have a valid stockId' });
      }

      // Ensure all quantities are 1
      if (!updatedProducts.every(p => p.quantity === 1)) {
        return res.status(400).json({ error: 'Each product must have quantity = 1' });
      }
    }

    const soldProducts = oldPurchase.products?.filter(p => p.isSold) || [];
    const returnedProducts = oldPurchase.products?.filter(p => p.isReturn) || [];

    const returnedStockIds = returnedProducts.map(p => String(p.stockId));
    const updatedStockIds = updatedProducts.map(p => String(p.stockId));

    // Prevent removing returned products
    for (const returned of returnedProducts) {
      if (!updatedStockIds.includes(String(returned.stockId))) {
        return res.status(400).json({
          error: `Cannot remove returned product with stock ID: ${returned.stockId}`
        });
      }
    }

    // Prevent modifying details of returned products
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

    // Prevent removing or modifying sold products
    for (const sold of soldProducts) {
      if (!updatedStockIds.includes(String(sold.stockId))) {
        return res.status(400).json({
          error: `Cannot remove or modify sold product with stock ID: ${sold.stockId}`
        });
      }
    }

    // Revert stock for removed unsold, unreturned products
    const removedUnsold = oldPurchase.products?.filter(p =>
      !p.isSold &&
      !p.isReturn &&
      !updatedStockIds.includes(String(p.stockId))
    ) || [];

    if (removedUnsold.length > 0) {
      await revertStock(removedUnsold);
    }

    // Handle document uploads and delete old files if any
    if (req.files?.length > 0) {
      if (oldPurchase.documents?.length > 0) {
        oldPurchase.documents.forEach(doc => {
          if (fs.existsSync(doc)) fs.unlinkSync(doc);
        });
      }
      req.body.documents = req.files.map(file => `uploads/${file.filename}`);
    }

    // Handle payments parsing and assign paymentRefNo
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

    // Revert old payments in account balances
    await revertAccountBalances(oldPurchase.payments || [], 'purchase');

    // Create stock for any new unsold products added
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

    // Final products list = sold + returned + updated (excluding those already sold or returned)
    const finalProducts = [
      ...soldProducts,
      ...returnedProducts,
      ...updatedProducts.filter(p =>
        !soldProducts.some(sp => String(sp.stockId) === String(p.stockId)) &&
        !returnedProducts.some(rp => String(rp.stockId) === String(p.stockId))
      )
    ];

    req.body.products = finalProducts;

    // Update purchase doc
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

    // Update account balances with new payments
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
