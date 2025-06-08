const Purchase = require('../../models/purchaseModel');
const generateAutoId = require('../../utils/generateAutoId');
const createStock = require('../../utils/createStock');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');

exports.addPurchase = async (req, res) => {
  try {
    const referenceNo = req.body.referenceNo || await generateAutoId('PUR');
    req.body.addedBy = req.user.userId;
    const filePaths = req.files?.map(file => `uploads/${file.filename}`) || [];

    for (const productLine of req.body.products || []) {
      if (productLine.quantity !== 1) {
        return res.status(400).json({
          error: `Quantity for product ${productLine.product} must be exactly 1`
        });
      }
    }

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

    if (payments.length > 0) {
      await updateAccountBalances(payments, 'purchase');
    }

    const createdStocks = await createStock(savedPurchase.products, savedPurchase._id, savedPurchase.businessLocation);

    // Assign stockId to products in purchase
    savedPurchase.products.forEach(product => {
      const matchedStock = createdStocks.find(
        s => s.imeiNo === product.imeiNo && s.product.toString() === product.product.toString()
      );
      if (matchedStock) product.stockId = matchedStock._id;
    });

    // Save the stockId updated purchase
    await savedPurchase.save();

    // Assign stockId to products in purchase
    savedPurchase.products.forEach(product => {
      const matchedStock = createdStocks.find(
        s => s.imeiNo === product.imeiNo && s.product.toString() === product.product.toString()
      );
      if (matchedStock) product.stockId = matchedStock._id;
    });

    // Save the stockId updated purchase
    await savedPurchase.save();

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
