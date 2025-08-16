const mongoose = require('mongoose');
const Purchase = require('../../models/purchaseModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const generateAutoId = require('../../utils/generateAutoId');
const consumeStock = require('../../utils/consumeStock');
const Stock = require('../../models/stockModel');

exports.addPurchaseReturn = async (req, res) => {
  try {
    const { oldPurchaseId } = req.params;
    const {
      businessLocation,
      products = [],
      totalReturnAmount,
      totalGstAmount,
      totalReturnAmountWithGst
    } = req.body;

    // Validate request data
    if (!mongoose.Types.ObjectId.isValid(oldPurchaseId)) {
      return res.status(400).json({ error: 'Invalid Purchase ID format' });
    }

    if (!businessLocation || products.length === 0) {
      return res.status(400).json({ error: 'Business location and products are required' });
    }

    // Find the original purchase
    const purchase = await Purchase.findById(oldPurchaseId);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ error: 'Original purchase not found' });
    }

    if (purchase.businessLocation.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Purchase does not belong to the given business location' });
    }

    // Validate each product before processing
    // First, check all products are valid before making any changes
    for (const item of products) {
      const matchedProduct = purchase.products.find(
        p => p.product.toString() === item.productId
      );

      // Check if product exists in original purchase
      if (!matchedProduct) {
        return res.status(400).json({
          error: `Product with ID ${item.productId} not found in the original purchase.`
        });
      }

      // Check if product exists in stock
      const stock = await Stock.findById(matchedProduct.stockId);
      if (!stock) {
        return res.status(400).json({
          error: `Stock entry for product with ID ${item.productId} not found.`
        });
      }

      const returnQuantity = item.quantity || 1;
      
      // Different validation for IMEI and non-IMEI products
      if (stock.imeiNo) {
        // For IMEI products, check if already returned
        if (matchedProduct.isReturn) {
          return res.status(400).json({
            error: `Product with IMEI ${stock.imeiNo} (ID: ${item.productId}) has already been returned on ${matchedProduct.returnDate}.`
          });
        }
        
        // Check if already sold
        if (stock.status === 0) {
          return res.status(400).json({
            error: `Mobile with IMEI ${stock.imeiNo} (ID: ${item.productId}) is already sold and cannot be returned.`
          });
        }
      } else {
        // For accessories, check remaining returnable quantity
        const alreadyReturnedQty = matchedProduct.returnedQty || 0;
        const remainingQty = matchedProduct.quantity - alreadyReturnedQty;
        
        if (remainingQty <= 0) {
          return res.status(400).json({
            error: `Accessory with ID ${item.productId} has already been fully returned.`
          });
        }
        
        if (returnQuantity > remainingQty) {
          return res.status(400).json({
            error: `Cannot return ${returnQuantity} units of accessory (ID: ${item.productId}). Only ${remainingQty} units available for return.`
          });
        }
        
        // Check stock quantity as well
        if (stock.quantity === 0) {
          return res.status(400).json({
            error: `Accessory with ID ${item.productId} is completely sold and cannot be returned.`
          });
        }
        
        if (returnQuantity > stock.quantity) {
          return res.status(400).json({
            error: `Cannot return ${returnQuantity} units of accessory (ID: ${item.productId}). Only ${stock.quantity} units available in stock.`
          });
        }
      }

      // Validate return quantity against original purchase
      if (returnQuantity <= 0 || returnQuantity > matchedProduct.quantity) {
        return res.status(400).json({
          error: `Invalid return quantity ${returnQuantity} for product ${item.productId}. Available from purchase: ${matchedProduct.quantity}`
        });
      }
    }

    const returnedProducts = [];
    const stocksToConsume = [];

    // Process each product after validation
    for (let item of products) {
      const matchedProduct = purchase.products.find(
        p => p.product.toString() === item.productId
      );

      const returnQuantity = item.quantity || 1;
      const stock = await Stock.findById(matchedProduct.stockId);
      
      // Handle returns differently based on product type
      if (stock.imeiNo) {
        // For IMEI products (mobiles), mark as fully returned
        matchedProduct.isReturn = true;
        matchedProduct.returnDate = new Date();
        matchedProduct.returnedQty = matchedProduct.quantity; // Full quantity
        matchedProduct.noOfReturnProducts = matchedProduct.quantity; // Track number of returned products
      } else {
        // For accessories, track partial returns
        matchedProduct.returnedQty = (matchedProduct.returnedQty || 0) + returnQuantity;
        matchedProduct.noOfReturnProducts = (matchedProduct.noOfReturnProducts || 0) + returnQuantity; // Update return count
        
        // Only mark as fully returned if all items are returned
        if (matchedProduct.returnedQty >= matchedProduct.quantity) {
          matchedProduct.isReturn = true;
          matchedProduct.returnDate = new Date();
        } else {
          // For partial returns, don't mark isReturn as true
          matchedProduct.partialReturnDate = new Date();
        }
      }
      
      returnedProducts.push({
        product: matchedProduct.product,
        imeiNo: matchedProduct.imeiNo,
        serialNo: matchedProduct.serialNo,
        color: matchedProduct.color,
        storage: matchedProduct.storage,
        unitCost: item.unitCost ?? 0,
        lineTotal: item.lineTotal ?? item.unitCost ?? 0,
        quantity: returnQuantity,
        gstApplicable: item.gstApplicable ?? false,
        gstPercentage: item.gstPercentage ?? 18,
        gstAmount: item.gstAmount ?? 0,
        lineTotalWithGst: item.lineTotalWithGst ?? item.unitCost ?? 0,
        note: item.note || ''
      });

      // Add to stock consumption list if stockId exists
      if (matchedProduct.stockId) {
        stocksToConsume.push({
          stockId: matchedProduct.stockId,
          quantity: returnQuantity
        });
      }
    }

    await purchase.save();

    // Consume stock for returned items
    if (stocksToConsume.length > 0) {
      await consumeStock(stocksToConsume);
    }

    const returnDoc = await PurchaseReturn.create({
      originalPurchase: purchase._id,
      businessLocation,
      referenceNo: await generateAutoId('PURRET'),
      returnedProducts,
      totalReturnAmount,
      totalGstAmount,
      totalReturnAmountWithGst,
      paymentStatus: 'due',
      paymentDue: totalReturnAmountWithGst,
      returnPayments: [],
      returnDate: new Date(),
      addedBy: req.user?._id
    });

    res.status(200).json({
      message: 'Purchase return recorded successfully',
      purchaseReturn: returnDoc
    });
  } catch (err) {
    console.error('Add Purchase Return Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};