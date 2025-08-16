const Purchase = require('../../models/purchaseModel');
const generateAutoId = require('../../utils/generateAutoId');
const createStock = require('../../utils/createStock');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const Stock = require('../../models/stockModel');

exports.addPurchase = async (req, res) => {
  try {
    const referenceNo = req.body.referenceNo || await generateAutoId('PUR');
    req.body.addedBy = req.user.userId;
    const filePaths = req.files?.map(file => `uploads/${file.filename}`) || [];

    const products = req.body.products || [];

    // Pre-validate all products including IMEI duplication
    for (const item of products) {
      if (!item.product) {
        return res.status(400).json({ error: 'Missing product reference in one of the products.' });
      }

      // Set originalUnitCost equal to unitCost
      if (item.unitCost) {
        item.originalUnitCost = item.unitCost;
      }

      if (item.imeiNo) {
        if (item.quantity !== 1) {
          return res.status(400).json({ error: `IMEI-based item must have quantity = 1, got ${item.quantity}` });
        }

        // Check for duplicate IMEI BEFORE purchase is saved
        const existing = await Stock.findOne({ imeiNo: item.imeiNo, status: 1 });
        if (existing) {
          return res.status(400).json({ error: `Duplicate IMEI ${item.imeiNo} already exists in stock.` });
        }

      } else {
        if (item.quantity == null || item.quantity < 0) {
          return res.status(400).json({ error: 'Accessories must have a quantity >= 0' });
        }
      }
    }

    // Parse and normalize payments
    let payments = [];
    if (req.body.payments) {
      try {
        if (typeof req.body.payments === 'string') {
          payments = JSON.parse(req.body.payments);
        } else if (Array.isArray(req.body.payments)) {
          payments = req.body.payments;
        } else {
          return res.status(400).json({ error: 'Invalid payments format' });
        }

        const paymentRefNo = await generateAutoId('PURPYMNT');
        payments = payments.map(p => ({
          ...p,
          paidOn: new Date(p.paidOn),
          paymentRefNo
        }));
      } catch (e) {
        return res.status(400).json({ error: 'Failed to parse payments' });
      }
    }

    // Create and save the purchase after validation
    const purchase = new Purchase({
      ...req.body,
      referenceNo,
      documents: filePaths,
      payments
    });

    const savedPurchase = await purchase.save();

    // Update account balances if payments exist
    if (payments.length > 0) {
      await updateAccountBalances(payments, 'purchase');
    }

    // Now safely create stock entries
    const updatedProducts = await createStock(
      savedPurchase.products,
      savedPurchase._id,
      savedPurchase.businessLocation
    );

    savedPurchase.products = updatedProducts;
    await savedPurchase.save();

    const populatedPurchase = await Purchase.findById(savedPurchase._id)
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .populate('products.product', 'productName')
      .populate('addedBy', 'name _id')
      .populate('payments.account')
      .populate('payments.method');

    res.status(201).json({
      message: 'Purchase added successfully',
      populatedPurchase
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};