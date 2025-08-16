const Sale = require('../../models/saleModel');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');
const BusinessLocation = require('../../models/businessLocationModel');
const Contact = require('../../models/contactModel');
const Brand = require('../../models/brandModel');
const mongoose = require('mongoose');

exports.getProductSellReport = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      productId, 
      customerId,
      locationId, 
      categoryId,
      brandId,
      viewType = 'detailed'
    } = req.query;

    // Validate dates if provided
    let dateFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Default to full day
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      dateFilter.saleDate = { $gte: start, $lte: end };
    }

    // Build base filters
    let filters = {
      isDeleted: { $ne: true },
      ...dateFilter
    };

    // Customer filter
    if (customerId && customerId !== 'All') {
      filters.customer = new mongoose.Types.ObjectId(customerId);
    }

    // Location filter
    if (locationId && locationId !== 'All') {
      filters.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Fetch sales matching filters
    const sales = await Sale.find(filters)
      .populate({
        path: 'products.product',
        populate: [
          { path: 'brand' },
          { path: 'category' }
        ]
      })
      .populate({
        path: 'products.purchaseRef',
        populate: {
          path: 'supplier'
        }
      })
      .populate('customer')
      .populate('businessLocation')
      .populate('payments.method')
      .lean();
    
    // Extract product sales based on view type
    switch(viewType) {
      case 'detailed':
        return handleDetailedView(sales, res, { productId, categoryId, brandId });
      
      case 'detailed_with_purchase':
        return handleDetailedWithPurchaseView(sales, res, { productId, categoryId, brandId });
      
      case 'grouped_by_product':
        return handleGroupedByProductView(sales, res, { productId, categoryId, brandId });
      
      case 'grouped_by_category':
        return handleGroupedByCategoryView(sales, res, { categoryId });
      
      case 'grouped_by_brand':
        return handleGroupedByBrandView(sales, res, { brandId });
      
      default:
        return handleDetailedView(sales, res, { productId, categoryId, brandId });
    }
  } catch (err) {
    console.error('Error fetching product sell report:', err);
    res.status(500).json({ error: err.message });
  }
};

// Handle detailed view - first tab
function handleDetailedView(sales, res, { productId, categoryId, brandId }) {
  let productSales = [];
  
  for (const sale of sales) {
    for (const productItem of sale.products || []) {
      // Skip if product is not populated or is deleted
      if (!productItem.product || productItem.product.isDeleted) continue;
      
      // Apply product filter if provided
      if (productId && productId !== 'All') {
        if (productItem.product._id.toString() !== productId) {
          continue;
        }
      }
      
      // Apply category filter if provided
      if (categoryId && categoryId !== 'All') {
        if (!productItem.product.category || productItem.product.category._id.toString() !== categoryId) {
          continue;
        }
      }
      
      // Apply brand filter if provided
      if (brandId && brandId !== 'All') {
        if (!productItem.product.brand || productItem.product.brand._id.toString() !== brandId) {
          continue;
        }
      }
      
      // Calculate values
      const unitPrice = productItem.unitPrice || 0;
      const discount = 0; // Replace with actual discount if available in your model
      const tax = productItem.gstAmount || 0;
      const priceIncTax = unitPrice + tax;
      const total = productItem.lineTotal || 0;
      
      // Create the product sale record for detailed view
      const productSale = {
        product: productItem.product.productName,
        sku: productItem.product.sku,
        customerName: sale.customer ? sale.customer.businessName? sale.customer.businessName + ' ' + sale.customer.firstName + ' ' + sale.customer.lastName : `${sale.customer.firstName || ''} ${sale.customer.lastName || ''}`.trim() : 'Unknown Customer',
        contactId: sale.customer?._id || '',
        invoiceNo: sale.invoiceNo,
        date: sale.saleDate,
        quantity: productItem.quantity,
        unitPrice: unitPrice,
        discount: discount,
        tax: tax,
        priceIncTax: priceIncTax,
        total: total,
        paymentMethod: sale.payments && sale.payments.length > 0 ? sale.payments[0].method?.name || 'Cash' : 'Cash'
      };
      
      productSales.push(productSale);
    }
  }

  // Sort by date (newest first)
  productSales.sort((a, b) => new Date(b.date) - new Date(a.date));

  return res.status(200).json({
    viewType: 'detailed',
    products: productSales
  });
}

// Handle detailed view with purchase info - second tab
function handleDetailedWithPurchaseView(sales, res, { productId, categoryId, brandId }) {
  let productSales = [];
  
  for (const sale of sales) {
    for (const productItem of sale.products || []) {
      // Skip if product is not populated or is deleted
      if (!productItem.product || productItem.product.isDeleted) continue;
      
      // Apply filters
      if (productId && productId !== 'All' && productItem.product._id.toString() !== productId) continue;
      if (categoryId && categoryId !== 'All' && (!productItem.product.category || productItem.product.category._id.toString() !== categoryId)) continue;
      if (brandId && brandId !== 'All' && (!productItem.product.brand || productItem.product.brand._id.toString() !== brandId)) continue;
      
      // Get purchase reference and supplier information
      const purchaseRef = productItem.purchaseRef;
      let purchaseRefNo = 'N/A';
      let supplierName = 'N/A';
      
      if (purchaseRef) {
        purchaseRefNo = purchaseRef.referenceNo || 'N/A';
        
        if (purchaseRef.supplier) {
          if (purchaseRef.supplier.businessName) {
            supplierName = purchaseRef.supplier.businessName;
            if (purchaseRef.supplier.firstName || purchaseRef.supplier.lastName) {
              supplierName += ' ' + `${purchaseRef.supplier.firstName || ''} ${purchaseRef.supplier.lastName || ''}`.trim();
            }
          } else {
            supplierName = `${purchaseRef.supplier.firstName || ''} ${purchaseRef.supplier.lastName || ''}`.trim() || 'Unknown Supplier';
          }
        }
      }
      
      // Create the product sale record with purchase info
      const productSale = {
        product: productItem.product.productName,
        sku: productItem.product.sku,
        customerName: sale.customer ? sale.customer.businessName ? sale.customer.businessName + ' ' + sale.customer.firstName + ' ' + sale.customer.lastName : `${sale.customer.firstName || ''} ${sale.customer.lastName || ''}`.trim() : 'Unknown Customer',
        invoiceNo: sale.invoiceNo,
        date: sale.saleDate,
        purchaseRefNo: purchaseRefNo,
        supplierName: supplierName,
        quantity: productItem.quantity
      };
      
      productSales.push(productSale);
    }
  }

  // Sort by date (newest first)
  productSales.sort((a, b) => new Date(b.date) - new Date(a.date));

  return res.status(200).json({
    viewType: 'detailed_with_purchase',
    products: productSales
  });
}

// Handle grouped by product view - third tab
async function handleGroupedByProductView(sales, res, { productId, categoryId, brandId }) {
  // Group by product
  const productMap = new Map();
  
  for (const sale of sales) {
    for (const productItem of sale.products || []) {
      // Skip if product is not populated or is deleted
      if (!productItem.product || productItem.product.isDeleted) continue;
      
      // Apply filters
      if (productId && productId !== 'All' && productItem.product._id.toString() !== productId) continue;
      if (categoryId && categoryId !== 'All' && (!productItem.product.category || productItem.product.category._id.toString() !== categoryId)) continue;
      if (brandId && brandId !== 'All' && (!productItem.product.brand || productItem.product.brand._id.toString() !== brandId)) continue;
      
      const itemProductId = productItem.product._id.toString();
      
      if (!productMap.has(itemProductId)) {
        productMap.set(itemProductId, {
          product: productItem.product.productName,
          sku: productItem.product.sku,
          date: sale.saleDate, // Just using the most recent sale date
          currentStock: productItem.product.quantity || 0,
          totalUnitSold: 0,
          total: 0
        });
      }
      
      const record = productMap.get(itemProductId);
      record.totalUnitSold += productItem.quantity || 0;
      record.total += productItem.lineTotal || 0;
      
      // Update with the most recent sale date
      if (new Date(sale.saleDate) > new Date(record.date)) {
        record.date = sale.saleDate;
      }
    }
  }

  // Convert map to array and sort by date
  const groupedProducts = Array.from(productMap.values());
  groupedProducts.sort((a, b) => new Date(b.date) - new Date(a.date));

  return res.status(200).json({
    viewType: 'grouped_by_product',
    products: groupedProducts
  });
}

// Handle grouped by category view - fourth tab
async function handleGroupedByCategoryView(sales, res, { categoryId }) {
  // Group by category
  const categoryMap = new Map();
  
  for (const sale of sales) {
    for (const productItem of sale.products || []) {
      // Skip if product is not populated, is deleted, or doesn't have category
      if (!productItem.product || 
          productItem.product.isDeleted || 
          !productItem.product.category) continue;
      
      // Apply category filter if provided
      if (categoryId && categoryId !== 'All' && 
          productItem.product.category._id.toString() !== categoryId) continue;
      
      const catId = productItem.product.category._id.toString();
      const catName = productItem.product.category.name || 'Uncategorized';
      
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, {
          category: catName,
          currentStock: 0,
          totalUnitSold: 0,
          total: 0
        });
      }
      
      const record = categoryMap.get(catId);
      record.currentStock += (productItem.product.quantity || 0);
      record.totalUnitSold += productItem.quantity || 0;
      record.total += productItem.lineTotal || 0;
    }
  }

  // Calculate totals
  let totalCurrentStock = 0;
  let totalUnitSold = 0;
  let grandTotal = 0;
  
  // Convert map to array
  const groupedCategories = Array.from(categoryMap.values());
  
  // Calculate totals
  for (const category of groupedCategories) {
    totalCurrentStock += category.currentStock;
    totalUnitSold += category.totalUnitSold;
    grandTotal += category.total;
  }

  return res.status(200).json({
    viewType: 'grouped_by_category',
    categories: groupedCategories,
    totals: {
      currentStock: totalCurrentStock,
      totalUnitSold: totalUnitSold,
      total: grandTotal
    }
  });
}

// Handle grouped by brand view - fifth tab
async function handleGroupedByBrandView(sales, res, { brandId }) {
  // Group by brand
  const brandMap = new Map();
  
  for (const sale of sales) {
    for (const productItem of sale.products || []) {
      // Skip if product is not populated, is deleted, or doesn't have brand
      if (!productItem.product || 
          productItem.product.isDeleted || 
          !productItem.product.brand) continue;
      
      // Apply brand filter if provided
      if (brandId && brandId !== 'All' && 
          productItem.product.brand._id.toString() !== brandId) continue;
      
      const bId = productItem.product.brand._id.toString();
      const bName = productItem.product.brand.name || 'No Brand';
      
      if (!brandMap.has(bId)) {
        brandMap.set(bId, {
          brand: bName,
          currentStock: 0,
          totalUnitSold: 0,
          total: 0
        });
      }
      
      const record = brandMap.get(bId);
      record.currentStock += (productItem.product.quantity || 0);
      record.totalUnitSold += productItem.quantity || 0;
      record.total += productItem.lineTotal || 0;
    }
  }

  // Calculate totals
  let totalCurrentStock = 0;
  let totalUnitSold = 0;
  let grandTotal = 0;
  
  // Convert map to array
  const groupedBrands = Array.from(brandMap.values());
  
  // Calculate totals
  for (const brand of groupedBrands) {
    totalCurrentStock += brand.currentStock;
    totalUnitSold += brand.totalUnitSold;
    grandTotal += brand.total;
  }

  return res.status(200).json({
    viewType: 'grouped_by_brand',
    brands: groupedBrands,
    totals: {
      currentStock: totalCurrentStock,
      totalUnitSold: totalUnitSold,
      total: grandTotal
    }
  });
}
