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

    // Validate products before creating purchase
    for (const item of req.body.products || []) {
      if (!item.product) {
        throw new Error('Missing product reference in one of the stock items.');
      }

      // For IMEI items (mobiles), quantity must be 1
      if (item.imeiNo && item.quantity !== 1) {
        return res.status(400).json({
          error: `IMEI-based item must have quantity = 1, got ${item.quantity}`
        });
      }

      // For accessories (no IMEI), quantity must be >= 0
      if (!item.imeiNo && (item.quantity == null || item.quantity < 0)) {
        return res.status(400).json({
          error: `Accessories must have a quantity >= 0`
        });
      }

      // Check for duplicate IMEI if provided
      if (item.imeiNo) {
        const existing = await Stock.findOne({
          imeiNo: item.imeiNo,
        });

        if (existing && existing.quantity > 0) {
          throw new Error(`Duplicate IMEI ${item.imeiNo} already exists and is in stock.`);
        }
      }
    }

    // Parse payments (support stringified JSON or array)
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

      const paymentRefNo = await generateAutoId('PURPYMNT');
      payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo
      }));
    }

    const purchase = new Purchase({
      ...req.body,
      referenceNo,
      documents: filePaths,
      payments
    });

    const savedPurchase = await purchase.save();

    // Update account balances if payments present
    if (payments.length > 0) {
      await updateAccountBalances(payments, 'purchase');
    }

    // Create stock entries for each product and get updated products with stockId
    const productsWithStockIds = await createStock(
      savedPurchase.products, 
      savedPurchase._id, 
      savedPurchase.businessLocation
    );

    // Replace original products with updated ones containing stockId
    savedPurchase.products = productsWithStockIds;
    await savedPurchase.save(); // persist the stockIds to DB

    const populatedPurchase = await Purchase.findById(savedPurchase._id)
      .populate('supplier', 'businessName firstName lastName')
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