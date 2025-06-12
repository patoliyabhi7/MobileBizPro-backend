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

    if (!mongoose.Types.ObjectId.isValid(oldPurchaseId)) {
      return res.status(400).json({ error: 'Invalid Purchase ID format' });
    }

    if (!businessLocation || products.length === 0) {
      return res.status(400).json({ error: 'Business location and products are required' });
    }

    const purchase = await Purchase.findById(oldPurchaseId);
    if (!purchase || purchase.isDeleted) {
      return res.status(404).json({ error: 'Original purchase not found' });
    }

    if (purchase.businessLocation.toString() !== businessLocation) {
      return res.status(403).json({ error: 'Purchase does not belong to the given business location' });
    }

    const returnedProducts = [];
    const stocksToConsume = [];

    for (let item of products) {
      const matchedProduct = purchase.products.find(
        p => p.product.toString() === item.productId && !p.isReturn
      );

      if (!matchedProduct) {
        return res.status(400).json({
          error: `Product with ID ${item.productId} not found or already returned.`
        });
      }

      // Check if product is sold using stock status
      const stock = await Stock.findById(matchedProduct.stockId);
      if (stock) {
        if (stock.imeiNo && stock.status === 0) {
          return res.status(400).json({
            error: `Mobile with ID ${item.productId} is already sold and cannot be returned.`
          });
        }
        if (!stock.imeiNo && stock.quantity === 0) {
          return res.status(400).json({
            error: `Accessory with ID ${item.productId} is completely sold and cannot be returned.`
          });
        }
      }

      // Validate return quantity
      const returnQuantity = item.quantity || 1;
      if (returnQuantity <= 0 || returnQuantity > matchedProduct.quantity) {
        return res.status(400).json({
          error: `Invalid return quantity ${returnQuantity} for product ${item.productId}. Available: ${matchedProduct.quantity}`
        });
      }

      // For accessories, check available stock quantity
      if (!stock?.imeiNo && returnQuantity > stock.quantity) {
        return res.status(400).json({
          error: `Cannot return ${returnQuantity} units. Only ${stock.quantity} units available in stock.`
        });
      }

      // Mark as returned in purchase
      matchedProduct.isReturn = true;
      matchedProduct.returnDate = new Date();

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