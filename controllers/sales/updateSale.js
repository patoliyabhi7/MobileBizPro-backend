const Sale = require('../../models/saleModel');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const { revertAccountBalances } = require('../../utils/revertAccountBalances');

exports.updateSale = async (req, res) => {
  try {
    // Step 1: Fetch the existing sale before update
    const oldSale = await Sale.findById(req.params.id);
    if (!oldSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Step 2: Handle document uploads
    if (req.files && req.files.length > 0) {
      // Delete old files
      if (oldSale.documents && oldSale.documents.length > 0) {
        oldSale.documents.forEach(doc => {
          if (fs.existsSync(doc)) fs.unlinkSync(doc);
        });
      }

      // Add new files
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

      let paymentRefNo = await generateAutoId('SALEPYMNT');

      payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: paymentRefNo
      }));

      req.body.payments = payments;
    }

    req.body.addedBy = req.user.userId;

    // Step 4: Revert old payment effects from accounts
    await revertAccountBalances(oldSale.payments, 'sale');

    // Step 5: Update the sale
    const updatedSale = await Sale.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('addedBy', 'name _id').populate('payments.account').populate('products.product', 'productName').populate('customer')
    .populate('businessLocation');

    if (!updatedSale) {
      return res.status(404).json({ message: 'Sale not found after update' });
    }

    // Step 6: Apply new payments to account balances
    if (req.body.payments && req.body.payments.length > 0) {
      await updateAccountBalances(req.body.payments, 'sale');
    }

    res.status(200).json({ message: 'Sale updated successfully', updatedSale });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
