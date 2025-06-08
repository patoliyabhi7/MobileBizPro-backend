const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');
const path = require('path');
const fs = require('fs');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const revertStock = require('../../utils/revertStock');
const consumeStock = require('../../utils/consumeStock');
const Stock = require('../../models/stockModel');
const Purchase = require('../../models/purchaseModel');

exports.updateSale = async (req, res) => {
  try {
    const saleId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      return res.status(400).json({ error: 'Invalid sale ID format' });
    }

    const oldSale = await Sale.findById(saleId).lean();
    if (!oldSale || oldSale.isDeleted) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Validate businessLocation from req.body or oldSale
    const businessLocation = req.body.businessLocation || oldSale.businessLocation?.toString();
    if (!businessLocation) {
      return res.status(400).json({ error: 'businessLocation is required' });
    }

    // Validate products array and stockId presence
    if (!Array.isArray(req.body.products) || req.body.products.length === 0) {
      return res.status(400).json({ error: 'At least one product required' });
    }
    for (const p of req.body.products) {
      if (!p.stockId) {
        return res.status(400).json({ error: 'Each product must have a stockId' });
      }
    }

    // Handle documents: delete old if new uploaded
    if (req.files?.length > 0 && Array.isArray(oldSale.documents)) {
      for (const docPath of oldSale.documents) {
        try {
          if (fs.existsSync(docPath)) fs.unlinkSync(docPath);
        } catch (e) {
          console.warn(`Failed to delete file ${docPath}`, e);
        }
      }
      req.body.documents = req.files.map(file => path.join('uploads', file.filename));
    }

    // Parse payments if sent as string or array
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

      // Assign new paymentRefNo and parse paidOn date and amount
      const newRefNo = await generateAutoId('SALEPYMNT');
      newPayments = newPayments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: newRefNo,
        amount: Number(p.amount || 0),
      }));

      req.body.payments = newPayments;
    }

    req.body.addedBy = req.user.userId;

    // Clone old payments for revert
    const oldPaymentsClone = JSON.parse(JSON.stringify(oldSale.payments || []));

    // Helper to get stockId set
    const getStockIdSet = arr => new Set(arr.map(p => p.stockId));

    const oldProductIds = getStockIdSet(oldSale.products || []);
    const newProductIds = getStockIdSet(req.body.products || []);

    // Products to revert stock for: in old but NOT in new AND unsold
    const toRevert = (oldSale.products || []).filter(
      p => !newProductIds.has(p.stockId) && !p.isSold
    );

    // Products to consume stock for: in new but NOT in old AND unsold
    const toConsume = (req.body.products || []).filter(
      p => !oldProductIds.has(p.stockId) && !p.isSold
    );

    // Revert stock for removed/changed products
    if (toRevert.length > 0) await revertStock(toRevert);

    // Revert old payments balances
    if (oldPaymentsClone.length > 0) {
      await revertAccountBalances(oldPaymentsClone, 'sale');
    }

    // Update Sale document
    const updatedSale = await Sale.findByIdAndUpdate(
      saleId,
      req.body,
      { new: true }
    )
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('payments.account')
      .populate('payments.method');

    if (!updatedSale) {
      return res.status(404).json({ message: 'Sale not found after update' });
    }

    // Consume stock for new added/changed products
    if (toConsume.length > 0) {
      await consumeStock(toConsume);

      // Update related Purchase product's isSold flag to true using stockId
      const stockIds = toConsume.map(p => p.stockId).filter(Boolean);

      if (stockIds.length > 0) {
        const stocks = await Stock.find({ _id: { $in: stockIds } }).select('purchaseRef');
        for (const stock of stocks) {
          const purchaseId = stock.purchaseRef;
          const stockId = stock._id;

          await Purchase.updateOne(
            { _id: purchaseId, 'products.stockId': stockId },
            { $set: { 'products.$.isSold': true } }
          );
        }
      }
    }

    // Update new payments account balances
    if (newPayments.length > 0) {
      await updateAccountBalances(newPayments, 'sale');
    }

    res.status(200).json({ message: 'Sale updated successfully', sale: updatedSale });
  } catch (err) {
    console.error('Update sale failed:', err);
    res.status(500).json({ error: err.message });
  }
};
