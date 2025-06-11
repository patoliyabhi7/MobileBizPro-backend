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

    const businessLocation = req.body.businessLocation || oldSale.businessLocation?.toString();
    if (!businessLocation) {
      return res.status(400).json({ error: 'businessLocation is required' });
    }

    if (!Array.isArray(req.body.products) || req.body.products.length === 0) {
      return res.status(400).json({ error: 'At least one product required' });
    }

    const resolvedProducts = [];

    for (const p of req.body.products) {
      const match = (oldSale.products || []).find(old =>
        old.product.toString() === p.product?.toString() &&
        old.imeiNo === p.imeiNo &&
        old.color === p.color &&
        old.storage === p.storage
      );

      resolvedProducts.push({
        ...p,
        stockId: match?.stockId || null,
        isReturn: match?.isReturn === true,
      });
    }

    // Replace documents
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

    // Parse payments
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

      const newRefNo = await generateAutoId('SALEPYMNT');
      newPayments = newPayments.map(p => {
        if (!p.method || !p.account) {
          throw new Error('Each payment must include valid method and account ObjectIds.');
        }

        return {
          ...p,
          paidOn: new Date(p.paidOn),
          paymentRefNo: newRefNo,
          amount: Number(p.amount || 0),
        };
      });

      req.body.payments = newPayments;
    }

    req.body.addedBy = req.user.userId;

    const oldPaymentsClone = JSON.parse(JSON.stringify(oldSale.payments || []));

    const getStockIdSet = arr => new Set(arr.map(p => p.stockId?.toString()));
    const oldProductIds = getStockIdSet(oldSale.products || []);
    const newProductIds = getStockIdSet(resolvedProducts);

    const toRevert = (oldSale.products || []).filter(
      p => !newProductIds.has(p.stockId?.toString()) && !p.isSold
    );

    const toConsume = resolvedProducts.filter(
      p => !oldProductIds.has(p.stockId?.toString()) && !p.isSold
    );

    if (toRevert.length > 0) await revertStock(toRevert);

    if (oldPaymentsClone.length > 0) {
      await revertAccountBalances(oldPaymentsClone, 'sale');
    }

    req.body.products = resolvedProducts;

    const updatedSale = await Sale.findByIdAndUpdate(saleId, req.body, { new: true })
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('payments.account')
      .populate('payments.method');

    if (!updatedSale) {
      return res.status(404).json({ message: 'Sale not found after update' });
    }

    if (toConsume.length > 0) {
      await consumeStock(toConsume);

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

    if (newPayments.length > 0) {
      await updateAccountBalances(newPayments, 'sale');
    }

    res.status(200).json({ message: 'Sale updated successfully', sale: updatedSale });
  } catch (err) {
    console.error('Update sale failed:', err);
    res.status(500).json({ error: err.message });
  }
};
