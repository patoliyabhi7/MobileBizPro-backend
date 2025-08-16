const Product = require('../../models/productModel');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const SaleReturn = require('../../models/saleReturnModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
const Stock = require('../../models/stockModel');
const BusinessLocation = require('../../models/businessLocationModel');
const mongoose = require('mongoose');

exports.getStockHistoryReport = async (req, res) => {
  try {
    const { productId, locationId } = req.query;

    // Validate required parameters
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    // Fetch the product
    const product = await Product.findById(productId)
      .populate('brand')
      .populate('category')
      .lean();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Build location filter
    let locationFilter = {};
    if (locationId && locationId !== 'All') {
      locationFilter.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Fetch location if specified
    let location = null;
    if (locationId && locationId !== 'All') {
      location = await BusinessLocation.findById(locationId);
      if (!location) {
        return res.status(404).json({ error: 'Business location not found' });
      }
    }

    // Get all purchases for this product
    const purchases = await Purchase.find({
      'products.product': new mongoose.Types.ObjectId(productId),
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .populate('supplier', 'businessName firstName lastName')
    .sort({ purchaseDate: 1 })
    .lean();

    // Get all sales for this product
    const sales = await Sale.find({
      'products.product': new mongoose.Types.ObjectId(productId),
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .populate('customer', 'businessName firstName lastName')
    .sort({ saleDate: 1 })
    .lean();

    // Get all sale returns for this product
    const saleReturns = await SaleReturn.find({
      'products.product': new mongoose.Types.ObjectId(productId),
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .populate('customer', 'businessName firstName lastName')
    .sort({ returnDate: 1 })
    .lean();

    // Get all purchase returns for this product
    const purchaseReturns = await PurchaseReturn.find({
      'products.product': new mongoose.Types.ObjectId(productId),
      isDeleted: { $ne: true },
      ...locationFilter
    })
    .populate('supplier', 'businessName firstName lastName')
    .sort({ returnDate: 1 })
    .lean();

    // Calculate summary data
    let totalPurchase = 0;
    let totalSold = 0;
    let totalSellReturn = 0;
    let totalPurchaseReturn = 0;
    let totalStockAdjustment = 0;
    let stockTransfersIn = 0;
    let stockTransfersOut = 0;
    let openingStock = 0; // This would typically come from an initial inventory value
    
    // Calculate totals from purchases
    purchases.forEach(purchase => {
      purchase.products.forEach(item => {
        if (item.product.toString() === productId) {
          totalPurchase += item.quantity || 0;
        }
      });
    });
    
    // Calculate totals from sales
    sales.forEach(sale => {
      sale.products.forEach(item => {
        if (item.product.toString() === productId) {
          totalSold += item.quantity || 0;
        }
      });
    });
    
    // Calculate totals from sale returns
    saleReturns.forEach(saleReturn => {
      saleReturn.products.forEach(item => {
        if (item.product.toString() === productId) {
          totalSellReturn += item.quantity || 0;
        }
      });
    });
    
    // Calculate totals from purchase returns
    purchaseReturns.forEach(purchaseReturn => {
      purchaseReturn.products.forEach(item => {
        if (item.product.toString() === productId) {
          totalPurchaseReturn += item.quantity || 0;
        }
      });
    });

    // Calculate current stock
    const currentStock = openingStock + totalPurchase + totalSellReturn + stockTransfersIn - 
                         totalSold - totalPurchaseReturn - totalStockAdjustment - stockTransfersOut;

    // Create an array of all stock history transactions
    let transactions = [];
    
    // Process purchases
    purchases.forEach(purchase => {
      purchase.products.forEach(item => {
        if (item.product.toString() === productId) {
          transactions.push({
            type: 'Purchase',
            quantityChange: `+${item.quantity}`,
            newQuantity: 0, // Will be calculated later
            date: purchase.purchaseDate,
            referenceNo: purchase.referenceNo,
            customerSupplierInfo: purchase.supplier 
              ? purchase.supplier.businessName || `${purchase.supplier.firstName || ''} ${purchase.supplier.lastName || ''}`.trim()
              : 'Unknown Supplier',
            sourceDocument: purchase
          });
        }
      });
    });
    
    // Process sales
    sales.forEach(sale => {
      sale.products.forEach(item => {
        if (item.product.toString() === productId) {
          transactions.push({
            type: 'Sell',
            quantityChange: `-${item.quantity}`,
            newQuantity: 0, // Will be calculated later
            date: sale.saleDate,
            referenceNo: sale.invoiceNo,
            customerSupplierInfo: sale.customer 
              ? sale.customer.businessName || `${sale.customer.firstName || ''} ${sale.customer.lastName || ''}`.trim()
              : 'Unknown Customer',
            sourceDocument: sale
          });
        }
      });
    });
    
    // Process sale returns
    saleReturns.forEach(saleReturn => {
      saleReturn.products.forEach(item => {
        if (item.product.toString() === productId) {
          transactions.push({
            type: 'Sell Return',
            quantityChange: `+${item.quantity}`,
            newQuantity: 0, // Will be calculated later
            date: saleReturn.returnDate,
            referenceNo: saleReturn.referenceNo,
            customerSupplierInfo: saleReturn.customer 
              ? saleReturn.customer.businessName || `${saleReturn.customer.firstName || ''} ${saleReturn.customer.lastName || ''}`.trim()
              : 'Unknown Customer',
            sourceDocument: saleReturn
          });
        }
      });
    });
    
    // Process purchase returns
    purchaseReturns.forEach(purchaseReturn => {
      purchaseReturn.products.forEach(item => {
        if (item.product.toString() === productId) {
          transactions.push({
            type: 'Purchase Return',
            quantityChange: `-${item.quantity}`,
            newQuantity: 0, // Will be calculated later
            date: purchaseReturn.returnDate,
            referenceNo: purchaseReturn.referenceNo,
            customerSupplierInfo: purchaseReturn.supplier 
              ? purchaseReturn.supplier.businessName || `${purchaseReturn.supplier.firstName || ''} ${purchaseReturn.supplier.lastName || ''}`.trim()
              : 'Unknown Supplier',
            sourceDocument: purchaseReturn
          });
        }
      });
    });

    // Sort transactions by date (oldest to newest)
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance / new quantity
    let runningBalance = openingStock;
    transactions.forEach(transaction => {
      const change = parseFloat(transaction.quantityChange);
      runningBalance += change;
      transaction.newQuantity = runningBalance.toFixed(2);
      
      // Format the quantity change for display
      transaction.quantityChange = change > 0 
        ? `+${change.toFixed(2)}` 
        : `${change.toFixed(2)}`;
      
      // Remove source document from response to minimize payload
      delete transaction.sourceDocument;
    });

    // Build the response
    const response = {
      productInfo: {
        id: product._id,
        name: product.productName,
        sku: product.sku
      },
      summary: {
        quantitiesIn: {
          totalPurchase,
          openingStock,
          totalSellReturn,
          stockTransfersIn
        },
        quantitiesOut: {
          totalSold,
          totalStockAdjustment,
          totalPurchaseReturn,
          stockTransfersOut
        },
        totals: {
          currentStock
        }
      },
      transactions: transactions.reverse(), // Reverse to get newest first
      location: location ? { id: location._id, name: location.name } : null
    };

    res.status(200).json(response);
  } catch (err) {
    console.error('Error fetching stock history report:', err);
    res.status(500).json({ error: err.message });
  }
};
