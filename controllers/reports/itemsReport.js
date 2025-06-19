const Purchase = require('../../models/purchaseModel');
const Sale = require('../../models/saleModel');
const Product = require('../../models/productModel');
const BusinessLocation = require('../../models/businessLocationModel');
const Contact = require('../../models/contactModel');
const Category = require('../../models/categoryModel');
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
      status: 'received' // Only include received purchases
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
      purchaseFilters.supplier = mongoose.Types.ObjectId(supplierId);
    }

    // Location filter
    if (locationId && locationId !== 'All') {
      purchaseFilters.businessLocation = mongoose.Types.ObjectId(locationId);
    }

    // Build category filter (will be applied after fetching data)
    const categoryFilter = categoryId && categoryId !== 'All' 
      ? mongoose.Types.ObjectId(categoryId) 
      : null;

    // Fetch purchases with all their details
    const purchases = await Purchase.find(purchaseFilters)
      .populate({
        path: 'products.product',
        populate: { 
          path: 'category',
          select: 'name'
        }
      })
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .sort({ purchaseDate: -1 }) // Sort by newest first
      .lean();

    // Build sale filters for checking sold items (if customer filter provided)
    let saleFilters = { 
      isDeleted: { $ne: true },
      status: 'completed'
    };

    // Date filter for sales
    if (saleStartDate && saleEndDate) {
      const start = new Date(saleStartDate);
      const end = new Date(saleEndDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      saleFilters.saleDate = { $gte: start, $lte: end };
    }

    // Customer filter
    if (customerId && customerId !== 'All') {
      saleFilters.customer = mongoose.Types.ObjectId(customerId);
    }

    // Fetch sales data if any sale filters are applied
    let salesData = [];
    if (customerId || (saleStartDate && saleEndDate)) {
      const sales = await Sale.find(saleFilters)
        .populate('products.product')
        .lean();
      
      // Extract sold items with their IMEIs/serials
      sales.forEach(sale => {
        sale.products.forEach(product => {
          if (product.imeiNo || product.serialNo) {
            salesData.push({
              productId: product.product._id.toString(),
              imeiNo: product.imeiNo,
              serialNo: product.serialNo,
              saleDate: sale.saleDate
            });
          }
        });
      });
    }

    // Process purchase data and filter out sold items
    let items = [];
    let totalQty = 0;
    let totalPurchasePrice = 0;
    let totalPurchaseAmount = 0;

    for (const purchase of purchases) {
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
        
        // Check if this item has been sold
        let isSold = false;
        if (salesData.length > 0) {
          // If there's sales filtering, check if this specific item was sold
          if (product.imeiNo || product.serialNo) {
            isSold = salesData.some(sale => 
              (product.imeiNo && sale.imeiNo === product.imeiNo) ||
              (product.serialNo && sale.serialNo === product.serialNo)
            );
          }
        }
        
        // Skip if sold and we're filtering by sales
        if ((customerId || (saleStartDate && saleEndDate)) && isSold) {
          continue;
        }
        
        // Format the description with IMEI, serial, color and storage
        const description = [
          product.imeiNo ? `IMEI NO: ${product.imeiNo}` : '',
          product.serialNo ? `SN NO: ${product.serialNo}` : '',
          product.color ? `Color: ${product.color}` : '',
          product.storage ? `Storage: ${product.storage}` : ''
        ].filter(Boolean).join('\n');
        
        // Calculate available quantity (original quantity - returns)
        const availableQty = product.isReturn ? 0 : product.quantity;
        
        // Skip if no quantity available
        if (availableQty <= 0) {
          continue;
        }
        
        // Add to totals
        totalQty += availableQty;
        totalPurchasePrice += product.unitCost * availableQty;
        totalPurchaseAmount += product.lineTotal;
        
        // Create the item record
        items.push({
          product: product.product.productName,
          description,
          purchaseDate: purchase.purchaseDate,
          purchase: purchase.referenceNo,
          availableQty,
          supplier: purchase.supplier ? purchase.supplier.businessName || `${purchase.supplier.firstName || ''} ${purchase.supplier.lastName || ''}`.trim() : 'Unknown Supplier',
          purchasePrice: product.unitCost,
          purchaseTotal: product.lineTotal
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
