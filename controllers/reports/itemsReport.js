const Purchase = require('../../models/purchaseModel');
const Sale = require('../../models/saleModel');
const Product = require('../../models/productModel');
const BusinessLocation = require('../../models/businessLocationModel');
const Contact = require('../../models/contactModel');
const Category = require('../../models/categoryModel');
const Stock = require('../../models/stockModel');
const mongoose = require('mongoose');

exports.getItemsReport = async (req, res) => {
  try {
    const {
      supplierId,
      purchaseStartDate,
      purchaseEndDate,
      customerId,
      saleStartDate,
      saleEndDate,
      categoryId,
      onlyImei,
      locationId
    } = req.query;

    // Build purchase filters
    let purchaseFilters = {
      isDeleted: { $ne: true },
      $or: [
        { status: 'received', createdFromReturn: { $ne: true } }, // Regular purchases
        { createdFromReturn: true }                               // Sale returns
      ]
    };

    // Date filter for purchases
    if (purchaseStartDate && purchaseEndDate) {
      const start = new Date(purchaseStartDate);
      const end = new Date(purchaseEndDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      purchaseFilters.purchaseDate = { $gte: start, $lte: end };
    }

    // Supplier filter
    if (supplierId && supplierId !== 'All') {
      purchaseFilters.supplier = new mongoose.Types.ObjectId(supplierId);
    }

    // Location filter
    if (locationId && locationId !== 'All') {
      purchaseFilters.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Build category filter (will be applied after fetching data)
    let categoryFilter = categoryId && categoryId !== 'All'
      ? new mongoose.Types.ObjectId(categoryId)
      : null;

    // Split the filters for regular purchases and sale returns
    let regularPurchaseFilters = {
      isDeleted: { $ne: true },
      status: 'received',
      createdFromReturn: { $ne: true } // Only regular purchases
    };

    let saleReturnFilters = {
      isDeleted: { $ne: true },
      createdFromReturn: true // Only sale returns
    };

    // Apply common filters to both queries
    if (purchaseStartDate && purchaseEndDate) {
      const start = new Date(purchaseStartDate);
      const end = new Date(purchaseEndDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      regularPurchaseFilters.purchaseDate = { $gte: start, $lte: end };
      saleReturnFilters.purchaseDate = { $gte: start, $lte: end };
    }

    if (supplierId && supplierId !== 'All') {
      regularPurchaseFilters.supplier = new mongoose.Types.ObjectId(supplierId);
      saleReturnFilters.supplier = new mongoose.Types.ObjectId(supplierId);
    }

    if (locationId && locationId !== 'All') {
      regularPurchaseFilters.businessLocation = new mongoose.Types.ObjectId(locationId);
      saleReturnFilters.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Build category filter (will be applied after fetching data)
    categoryFilter = categoryId && categoryId !== 'All'
      ? new mongoose.Types.ObjectId(categoryId)
      : null;

    // Fetch regular purchases first
    const regularPurchases = await Purchase.find(regularPurchaseFilters)
      .populate({
        path: 'products.product',
        populate: {
          path: 'category',
          select: 'name'
        }
      })
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .sort({ purchaseDate: -1 })
      .lean();

    // Fetch sales data - always fetch to ensure sold items are properly filtered
    let salesData = [];
    
    // Modified to always fetch sales data regardless of filters
    const sales = await Sale.find({ 
      isDeleted: { $ne: true }, 
      status: 'completed' 
    })
      .populate('products.product')
      .lean();

    // Extract sold items with their IMEIs/serials and also by productId and quantity
    const productQuantitySold = {}; // Track quantities sold by productId
    
    sales.forEach(sale => {
      sale.products.forEach(product => {
        const productId = product.product._id.toString();
        
        // Track by IMEI/Serial for precise tracking
        if (product.imeiNo || product.serialNo) {
          salesData.push({
            productId,
            imeiNo: product.imeiNo,
            serialNo: product.serialNo,
            saleDate: sale.saleDate
          });
        }
        
        // Also track by product ID and quantity for non-IMEI items
        if (!productQuantitySold[productId]) {
          productQuantitySold[productId] = 0;
        }
        productQuantitySold[productId] += product.quantity;
      });
    });

    // Process regular purchase data and only include items with available stock
    let items = [];
    let totalQty = 0;
    let totalPurchasePrice = 0;
    let totalPurchaseAmount = 0;

    for (const purchase of regularPurchases) {
      for (const product of purchase.products) {
        // Skip if product is deleted or doesn't exist
        if (!product.product || product.product.isDeleted) continue;

        // Apply category filter if provided
        if (categoryFilter &&
          (!product.product.category || product.product.category._id.toString() !== categoryFilter.toString())) {
          continue;
        }

        // If only items with IMEI are requested, skip those without
        if (onlyImei === 'true' && !product.imeiNo) {
          continue;
        }

        // Get availableQty directly from Stock model
        let availableQty = 0;
        if (product.stockId) {
          const stockDoc = await Stock.findById(product.stockId).lean();
          availableQty = stockDoc ? stockDoc.quantity : 0;
        }

        // Skip if no quantity available - this means it's sold out
        if (availableQty <= 0) {
          continue;
        }

        // Format the description
        const description = [
          product.imeiNo ? `IMEI NO: ${product.imeiNo}` : '',
          product.serialNo ? `SN NO: ${product.serialNo}` : '',
          product.color ? `Color: ${product.color}` : '',
          product.storage ? `Storage: ${product.storage}` : ''
        ].filter(Boolean).join('\n');

        // Add to totals
        totalQty += availableQty;
        totalPurchasePrice += product.unitCost;
        totalPurchaseAmount += product.unitCost * availableQty;

        // Create the item record
        items.push({
          product: product.product.productName,
          description,
          purchaseDate: purchase.purchaseDate,
          purchase: purchase.referenceNo,
          availableQty,
          supplier: purchase.supplier ? purchase.supplier.businessName ? purchase.supplier.businessName + ' ' + `${purchase.supplier.firstName || ''} ${purchase.supplier.lastName || ''}`.trim() : `${purchase.supplier.firstName || ''} ${purchase.supplier.lastName || ''}`.trim() : 'Unknown Supplier',
          purchasePrice: product.unitCost,
          purchaseTotal: product.unitCost * availableQty
        });
      }
    }

    // Now fetch and add sale returns
    const saleReturns = await Purchase.find(saleReturnFilters)
      .populate({
        path: 'products.product',
        populate: {
          path: 'category',
          select: 'name'
        }
      })
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .sort({ purchaseDate: -1 })
      .lean();

    // Process sale returns with the same simplified approach
    for (const saleReturn of saleReturns) {
      for (const product of saleReturn.products) {
        // Skip if product is deleted or doesn't exist
        if (!product.product || product.product.isDeleted) continue;

        // Apply category filter if provided
        if (categoryFilter &&
          (!product.product.category || product.product.category._id.toString() !== categoryFilter.toString())) {
          continue;
        }

        // If only items with IMEI are requested, skip those without
        if (onlyImei === 'true' && !product.imeiNo) {
          continue;
        }

        // Get availableQty directly from Stock model
        let availableQty = 0;
        if (product.stockId) {
          const stockDoc = await Stock.findById(product.stockId).lean();
          availableQty = stockDoc ? stockDoc.quantity : 0;
        }

        // Skip if no quantity available - this means it's sold out
        if (availableQty <= 0) {
          continue;
        }

        // Format the description
        const description = [
          product.imeiNo ? `IMEI NO: ${product.imeiNo}` : '',
          product.serialNo ? `SN NO: ${product.serialNo}` : '',
          product.color ? `Color: ${product.color}` : '',
          product.storage ? `Storage: ${product.storage}` : ''
        ].filter(Boolean).join('\n');

        // Use originalUnitCost if available, otherwise fall back to unitCost
        const purchasePrice = product.originalUnitCost || product.unitCost;

        // Add to totals
        totalQty += availableQty;
        totalPurchasePrice += purchasePrice;
        totalPurchaseAmount += purchasePrice * availableQty;

        // Create the item record
        items.push({
          product: product.product.productName,
          description,
          purchaseDate: saleReturn.purchaseDate,
          purchase: saleReturn.referenceNo,
          availableQty,
          supplier: saleReturn.supplier ? saleReturn.supplier.businessName ? saleReturn.supplier.businessName + ' ' + `${saleReturn.supplier.firstName || ''} ${saleReturn.supplier.lastName || ''}`.trim() : `${saleReturn.supplier.firstName || ''} ${saleReturn.supplier.lastName || ''}`.trim() : 'Unknown Supplier',
          purchasePrice: purchasePrice,
          purchaseTotal: purchasePrice * availableQty,
          isReturn: true // Mark as return for UI distinction if needed
        });
      }
    }

    // Return the report data with all totals
    res.status(200).json({
      items,
      totals: {
        totalQty,
        totalPurchasePrice,
        totalPurchaseAmount
      }
    });

  } catch (err) {
    console.error('Error fetching items report:', err);
    res.status(500).json({ error: err.message });
  }
};
