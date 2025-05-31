const Sale = require('../../models/saleModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');
const revertStock = require('../../utils/revertStock');
const consumeStock = require('../../utils/consumeStock');
const fs = require('fs');
const path = require('path');

exports.updateSale = async (req, res) => {
  try {
    const oldSale = await Sale.findById(req.params.id).lean();
    if (!oldSale) return res.status(404).json({ message: 'Sale not found' });

    const businessLocation = req.body.businessLocation || oldSale.businessLocation?.toString();
    if (!businessLocation) return res.status(400).json({ error: 'businessLocation is required' });

    // Delete old documents
    if (req.files?.length > 0) {
      if (oldSale.documents?.length > 0) {
        oldSale.documents.forEach(doc => {
          if (fs.existsSync(doc)) fs.unlinkSync(doc);
        });
      }
      req.body.documents = req.files.map(file => path.join('uploads', file.filename));
    }

    // Handle payments
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
      newPayments = newPayments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: newRefNo
      }));

      req.body.payments = newPayments;
    }

    req.body.addedBy = req.user.userId;

    // Revert old values
    await revertAccountBalances(oldSale.payments || [], 'sale');
    await revertStock(oldSale.products || [], businessLocation);

    // Update sale
    const updatedSale = await Sale.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('payments.account')
      .populate('payments.method');

    if (!updatedSale) return res.status(404).json({ message: 'Sale not found after update' });

    await consumeStock(req.body.products || []);

    // Apply new payments
    if (newPayments?.length > 0) {
      await updateAccountBalances(newPayments, 'sale');
    }

    res.status(200).json({ message: 'Sale updated successfully', updatedSale });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
