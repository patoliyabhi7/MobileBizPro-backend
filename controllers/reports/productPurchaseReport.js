const Purchase = require('../../models/purchaseModel');
const Product = require('../../models/productModel');
const BusinessLocation = require('../../models/businessLocationModel');
const Contact = require('../../models/contactModel');
const Brand = require('../../models/brandModel');
const mongoose = require('mongoose');

exports.getProductPurchaseReport = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      productId, 
      supplierId, 
      locationId, 
      brandId
    } = req.query;

    // Validate dates if provided
    let dateFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Set to end of day
      dateFilter.purchaseDate = { $gte: start, $lte: end };
    }

    // Build filters
    let filters = {
      isDeleted: { $ne: true },
      ...dateFilter
    };

    // Supplier filter
    if (supplierId && supplierId !== 'All') {
      filters.supplier = new mongoose.Types.ObjectId(supplierId);
    }

    // Location filter
    if (locationId && locationId !== 'All') {
      filters.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Brand filter will be applied via an aggregation step
    const brandFilter = brandId && brandId !== 'All' ? new mongoose.Types.ObjectId(brandId) : null;

    // Fetch all purchases that match the filters
    const purchases = await Purchase.find(filters)
      .populate({
        path: 'products.product',
        populate: { path: 'brand' }
      })
      .populate('supplier')
      .populate('businessLocation')
      .lean();

    // Extract product purchases and apply remaining filters
    let productPurchases = [];
    
    for (const purchase of purchases) {
      for (const productItem of purchase.products || []) {
        // Skip if product is not populated or is deleted
        if (!productItem.product || productItem.product.isDeleted) continue;
        
        // Apply product ID filter if provided
        if (productId && productId !== 'All') {
          if (productItem.product._id.toString() !== productId) {
            continue;
          }
        }
        
        // Apply brand filter if provided
        if (brandFilter && (!productItem.product.brand || productItem.product.brand._id.toString() !== brandFilter.toString())) {
          continue;
        }
        
        // Create the product purchase record
        const productPurchase = {
          product: productItem.product.productName,
          sku: productItem.product.sku,
          supplier: purchase.supplier ? purchase.supplier.businessName + ' ' + `${purchase.supplier.firstName || ''} ${purchase.supplier.lastName || ''}`.trim() : 'Unknown Supplier',
          referenceNo: purchase.referenceNo,
          date: purchase.purchaseDate,
          quantity: productItem.quantity,
          totalUnitAdjusted: productItem.isReturn ? productItem.quantity : 0,
          unitPurchasePrice: productItem.unitCost,
          subtotal: productItem.lineTotal
        };
        
        productPurchases.push(productPurchase);
      }
    }

    // Sort by date (newest first)
    productPurchases.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
      filters: {
        startDate: startDate || '',
        endDate: endDate || '',
        productId: productId || 'All',
        supplierId: supplierId || 'All',
        locationId: locationId || 'All',
        brandId: brandId || 'All'
      },
      products: productPurchases
    });
  } catch (err) {
    console.error('Error fetching product purchase report:', err);
    res.status(500).json({ error: err.message });
  }
};
