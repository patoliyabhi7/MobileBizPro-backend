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

    const updatedsaleId = new mongoose.Types.ObjectId(saleId);
    const oldSale = await Sale.findById(updatedsaleId).lean();
    if (!oldSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Clone old payments to prevent mutation issues
    const oldPaymentsClone = JSON.parse(JSON.stringify(oldSale.payments || []));

    // Determine businessLocation
    const businessLocation = req.body.businessLocation || oldSale.businessLocation?.toString();
    if (!businessLocation) {
      return res.status(400).json({ error: 'businessLocation is required' });
    }

    // Handle document replacement
    if (req.files?.length > 0 && Array.isArray(oldSale.documents)) {
      oldSale.documents.forEach(docPath => {
        if (fs.existsSync(docPath)) fs.unlinkSync(docPath);
      });
      req.body.documents = req.files.map(file => path.join('uploads', file.filename));
    }

    // Handle payments parsing and formatting
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

      // Assign new ref no
      const newRefNo = await generateAutoId('SALEPYMNT');
      newPayments = newPayments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: newRefNo,
        amount: Number(p.amount || 0)
      }));

      req.body.payments = newPayments;
    }

    req.body.addedBy = req.user.userId;

    // Revert old account balances and stock
    if (oldPaymentsClone.length > 0) {
      await revertAccountBalances(oldPaymentsClone, 'sale');
    }

    if (Array.isArray(oldSale.products) && oldSale.products.length > 0) {
      await revertStock(oldSale.products, businessLocation);
    }

    // Update sale
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

    // Consume stock again
    if (Array.isArray(req.body.products) && req.body.products.length > 0) {
      await consumeStock(req.body.products);

      // Fetch purchaseRefs using imeiNo
      const imeiNos = req.body.products.map(p => p.imeiNo).filter(Boolean);

      if (imeiNos.length > 0) {
        const stocks = await Stock.find({ imeiNo: { $in: imeiNos } }).select('purchaseRef');
        const purchaseIds = stocks.map(s => s.purchaseRef).filter(Boolean);

        if (purchaseIds.length > 0) {
          await Purchase.updateMany(
            { _id: { $in: purchaseIds } },
            { $set: { isSold: true } }
          );
        }
      }
    }


    // Update account balances again
    if (updatedSale.payments.length > 0) {
      await updateAccountBalances(newPayments, 'sale');
    }

    res.status(200).json({ message: 'Sale updated successfully', sale: updatedSale });
  } catch (err) {
    console.error('Update sale failed:', err);
    res.status(500).json({ error: err.message });
  }
};
