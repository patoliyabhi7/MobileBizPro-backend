const Purchase = require('../../models/purchaseModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');

exports.addPurchase = async (req, res) => {
  try {
    const referenceNo = req.body.referenceNo || await generateAutoId('PUR');
    req.body.addedBy = req.user.userId;
    const filePaths = req.files?.map(file => `uploads/${file.filename}`) || [];
    // If payments are sent as JSON string (common in multipart form-data), parse them
    let payments = [];
    if (req.body.payments) {
      if (typeof req.body.payments === 'string') {
        try {
          payments = JSON.parse(req.body.payments);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid payments format' });
        }
      } else if (Array.isArray(req.body.payments)) {
        payments = req.body.payments;
      }

      let paymentRefNo = await generateAutoId('PURPYMNT');
    
      // Format date fields
      payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: paymentRefNo
      }));
    }

    const purchase = new Purchase({
      ...req.body,
      referenceNo,
      documents: filePaths,
      payments
    });

    await purchase.save();
    if (purchase.payments && purchase.payments.length > 0) {
      await updateAccountBalances(purchase.payments, 'purchase');
    }
    const populatedPurchase = await Purchase.findById(purchase._id).populate('supplier', 'businessName firstName lastName')
    .populate('businessLocation', 'name')
    .populate('products.product', 'productName')
    .populate('addedBy', 'name _id')
    .populate('payments.account')
    .populate('payments.method');
    res.status(201).json({ message: 'Purchase added successfully', populatedPurchase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
