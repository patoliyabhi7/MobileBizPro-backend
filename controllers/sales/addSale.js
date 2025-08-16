const Sale = require('../../models/saleModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');
const consumeStock = require('../../utils/consumeStock');
const Stock = require('../../models/stockModel');
const path = require('path');
const Purchase = require('../../models/purchaseModel');

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

    // Validate stockIds and quantities for each product
    const validatedProducts = [];
    
    for (const p of req.body.products) {
      // Validate quantity based on product type
      const requestedQuantity = p.quantity || 1;

      // Skip stock validation if quantity is 0
      if (requestedQuantity === 0) {
        validatedProducts.push({
          ...p,
          quantity: 0,
        });
        continue;
      }
      
      // Verify stockId exists if needed
      if (!p.stockId) {
        return res.status(400).json({
          error: `stockId is required for product ${p.product}`
        });
      }

      // Validate the stock exists and has sufficient quantity
      const stock = await Stock.findById(p.stockId);
      if (!stock) {
        return res.status(404).json({
          error: `Stock not found with ID: ${p.stockId}`
        });
      }

      // Get the original purchase reference by finding the purchase that contains this stockId
      let purchaseRef = null;
      try {
        const purchase = await Purchase.findOne({
          'products.stockId': stock._id
        });
        if (purchase) {
          purchaseRef = purchase._id;
        }
      } catch (err) {
        console.error(`Failed to find purchase reference for stock ${stock._id}:`, err);
      }

      if (stock.imeiNo) {
        // Mobile: quantity must be 1 and status must be available
        if (requestedQuantity !== 1) {
          return res.status(400).json({
            error: `IMEI-based product quantity must be 1, got ${requestedQuantity}`
          });
        }
        
        if (stock.status !== 1) {
          return res.status(400).json({
            error: `Stock with IMEI ${stock.imeiNo} is not available for sale (status: ${stock.status})`
          });
        }
      } else {
        // Accessory: verify sufficient quantity
        if (stock.quantity < requestedQuantity) {
          return res.status(400).json({
            error: `Insufficient stock for product (ID: ${p.product}). Required: ${requestedQuantity}, Available: ${stock.quantity}`
          });
        }
      }

      validatedProducts.push({
        ...p,
        quantity: requestedQuantity,
        originalUnitCost: stock.unitCost, // Store the original purchase cost
        purchaseRef: purchaseRef, // Store the purchase reference
      });
    }

    // Prepare sale data
    const saleData = {
      ...req.body,
      invoiceNo,
      addedBy,
      documents: filePaths,
      payments,
      products: validatedProducts,
    };

    // Save sale first
    const sale = new Sale(saleData);
    await sale.save();

    // Consume stock (only for products with quantity > 0)
    const productsToConsume = validatedProducts.filter(p => p.quantity > 0 && p.stockId);
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