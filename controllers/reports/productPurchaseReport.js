const Purchase = require('../../models/purchaseModel');
const Product = require('../../models/productModel');
const BusinessLocation = require('../../models/businessLocationModel');
const Contact = require('../../models/contactModel');
const Brand = require('../../models/brandModel');
const mongoose = require('mongoose');
const PurchaseReturn = require('../../models/purchaseReturnModel'); // Add this at the top

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
      createdFromReturn: { $ne: true }, // Exclude purchases created from returns
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
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation')
      .lean();

    // Fetch purchase returns
    let returnFilters = { isDeleted: { $ne: true } };
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      returnFilters.returnDate = { $gte: start, $lte: end };
    }
    if (locationId && locationId !== 'All') {
      returnFilters.businessLocation = new mongoose.Types.ObjectId(locationId);
    }
    const purchaseReturns = await PurchaseReturn.find(returnFilters)
      .populate({
        path: 'returnedProducts.product',
        populate: { path: 'brand' }
      })
      .populate('businessLocation')
      .populate('originalPurchase')
      .populate({
        path: 'originalPurchase',
        populate: { path: 'supplier', select: 'businessName firstName lastName' }
      })
      .lean();

    let productPurchases = [];

    // Add purchases
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
        productPurchases.push({
          type: 'purchase',
          product: productItem.product.productName,
          sku: productItem.product.sku,
          supplier: purchase.supplier ? purchase.supplier.businessName ? purchase.supplier.businessName + ' ' + `${purchase.supplier.firstName || ''} ${purchase.supplier.lastName || ''}`.trim() : `${purchase.supplier.firstName || ''} ${purchase.supplier.lastName || ''}`.trim() : 'Unknown Supplier',
          referenceNo: purchase.referenceNo,
          date: purchase.purchaseDate,
          quantity: productItem.quantity,
          unitPurchasePrice: productItem.unitCost,
          subtotal: productItem.lineTotal
        });
      }
    }

    // Add purchase returns
    for (const purchaseReturn of purchaseReturns) {
      for (const returnedItem of purchaseReturn.returnedProducts || []) {
        if (!returnedItem.product || returnedItem.product.isDeleted) continue;

        // Apply product ID filter if provided
        if (productId && productId !== 'All') {
          if (returnedItem.product._id.toString() !== productId) {
            continue;
          }
        }

        // Apply brand filter if provided
        if (brandFilter && (!returnedItem.product.brand || returnedItem.product.brand._id.toString() !== brandFilter.toString())) {
          continue;
        }

        productPurchases.push({
          type: 'return',
          product: returnedItem.product.productName,
          sku: returnedItem.product.sku,
          supplier: purchaseReturn.originalPurchase && purchaseReturn.originalPurchase.supplier ? purchaseReturn.originalPurchase.supplier.businessName + ' ' + purchaseReturn.originalPurchase.supplier.firstName + ' ' + purchaseReturn.originalPurchase.supplier.lastName : 'Unknown Supplier',
          referenceNo: purchaseReturn.referenceNo,
          date: purchaseReturn.returnDate,
          quantity: -Math.abs(returnedItem.quantity || 0), // Negative for returns
          unitPurchasePrice: returnedItem.unitCost,
          subtotal: -Math.abs(returnedItem.lineTotal || 0) // Negative for returns
        });
      }
    }

    // Sort by date (newest first)
    productPurchases.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate totals
    const totalQuantity = productPurchases.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalSubtotal = productPurchases.reduce((sum, item) => sum + (item.subtotal || 0), 0);

    res.status(200).json({
      filters: {
        startDate: startDate || '',
        endDate: endDate || '',
        productId: productId || 'All',
        supplierId: supplierId || 'All',
        locationId: locationId || 'All',
        brandId: brandId || 'All'
      },
      products: productPurchases,
      totals: {
        totalQuantity,
        totalSubtotal
      }
    });
  } catch (err) {
    console.error('Error fetching product purchase report:', err);
    res.status(500).json({ error: err.message });
  }
};
