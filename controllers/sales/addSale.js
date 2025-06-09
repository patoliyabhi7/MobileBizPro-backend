const Sale = require('../../models/saleModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const consumeStock = require('../../utils/consumeStock');
const Purchase = require('../../models/purchaseModel');
const Stock = require('../../models/stockModel');
const path = require('path');

exports.addSale = async (req, res) => {
  try {
    // Generate invoice number if not provided
    const invoiceNo = req.body.invoiceNo || await generateAutoId('INV');

    const addedBy = req.user.userId;
    const businessLocation = req.body.businessLocation;
    if (!businessLocation) {
      return res.status(400).json({ error: 'businessLocation is required' });
    }

    // Parse payments safely
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

      // Generate paymentRefNo once per sale
      const paymentRefNo = await generateAutoId('SALEPYMNT');
      payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo,
      }));
    }

    // Handle uploaded files (if any)
    const filePaths = req.files?.map(file => path.join('uploads', file.filename)) || [];

    // Validate products array presence
    if (!Array.isArray(req.body.products) || req.body.products.length === 0) {
      return res.status(400).json({ error: 'At least one product required' });
    }

    // Resolve stockId for each product
    const resolvedProducts = [];

    for (const p of req.body.products) {
      const stock = await Stock.findOne({
        product: p.product,
        imeiNo: p.imeiNo,
        color: p.color,
        storage: p.storage,
        status: 1, // only available stock
      });

      if (!stock) {
        return res.status(404).json({
          error: `No available stock found for product ${p.product} (IMEI: ${p.imeiNo || 'N/A'})`,
        });
      }

      resolvedProducts.push({
        ...p,
        stockId: stock._id,
      });
    }

    // Prepare sale data
    const saleData = {
      ...req.body,
      invoiceNo,
      addedBy,
      documents: filePaths,
      payments,
      products: resolvedProducts, // ✅ with resolved stockIds
    };

    // Save sale first
    const sale = new Sale(saleData);
    await sale.save();

    // Consume stock
    await consumeStock(resolvedProducts);

    // Update Purchase records to mark sold items using stockId
    const stockIds = resolvedProducts.map(p => p.stockId);
    const stocks = await Stock.find({ _id: { $in: stockIds } }).select('purchaseRef');

    for (const stock of stocks) {
      const purchaseId = stock.purchaseRef;
      const stockId = stock._id;
      if (purchaseId) {
        await Purchase.updateOne(
          { _id: purchaseId, 'products.stockId': stockId },
          { $set: { 'products.$.isSold': true } }
        );
      }
    }

    // Update account balances if payments were made
    if (payments.length > 0) {
      await updateAccountBalances(payments, 'sale');
    }

    // Populate sale for response
    const populatedSale = await Sale.findById(sale._id)
      .populate('payments.account')
      .populate('addedBy', 'name _id')
      .populate('customer')
      .populate('businessLocation')
      .populate('products.product')
      .populate('payments.method');

    res.status(201).json({
      message: 'Sale added successfully',
      populatedSale,
    });
  } catch (err) {
    console.error('Error in addSale:', err);
    res.status(500).json({ error: err.message });
  }
};
