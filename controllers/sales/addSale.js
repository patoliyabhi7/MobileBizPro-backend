const Sale = require('../../models/saleModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const consumeStock = require('../../utils/consumeStock');
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

    // Resolve stockId for each product and validate quantities
    const resolvedProducts = [];

    for (const p of req.body.products) {
      // Validate quantity based on product type
      const requestedQuantity = p.quantity || 1;

      if (p.imeiNo) {
        // Mobile: quantity must be 0 or 1
        if (![0, 1].includes(requestedQuantity)) {
          return res.status(400).json({
            error: `IMEI-based product quantity must be 0 or 1, got ${requestedQuantity}`
          });
        }
      } else {
        // Accessory: quantity must be >= 0
        if (requestedQuantity < 0) {
          return res.status(400).json({
            error: `Accessory quantity must be >= 0, got ${requestedQuantity}`
          });
        }
      }

      // Skip stock resolution if quantity is 0
      if (requestedQuantity === 0) {
        resolvedProducts.push({
          ...p,
          quantity: 0,
          stockId: null,
        });
        continue;
      }

      // Find available stock
      const stockQuery = {
        product: p.product,
        businessLocation: businessLocation,
        quantity: { $gte: requestedQuantity }
      };

      // Add specific filters for mobiles
      if (p.imeiNo) {
        stockQuery.imeiNo = p.imeiNo;
        stockQuery.status = 1; // Available mobile
      }

      // Add optional filters if provided
      if (p.color) stockQuery.color = p.color;
      if (p.storage) stockQuery.storage = p.storage;

      const stock = await Stock.findOne(stockQuery);

      if (!stock) {
        const productType = p.imeiNo ? 'mobile' : 'accessory';
        const identifier = p.imeiNo ? `IMEI: ${p.imeiNo}` : `Product: ${p.product}`;
        return res.status(404).json({
          error: `Insufficient stock for ${productType} (${identifier}). Required: ${requestedQuantity}, Available: ${stock?.quantity || 0}`
        });
      }

      resolvedProducts.push({
        ...p,
        quantity: requestedQuantity,
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
      products: resolvedProducts,
    };

    // Save sale first
    const sale = new Sale(saleData);
    await sale.save();

    // Consume stock (only for products with quantity > 0)
    const productsToConsume = resolvedProducts.filter(p => p.quantity > 0 && p.stockId);
    if (productsToConsume.length > 0) {
      await consumeStock(productsToConsume);
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