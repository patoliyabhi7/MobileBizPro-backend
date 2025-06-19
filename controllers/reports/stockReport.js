const Stock = require('../../models/stockModel');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');
const BusinessLocation = require('../../models/businessLocationModel');
const Brand = require('../../models/brandModel');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const mongoose = require('mongoose');

exports.getStockReport = async (req, res) => {
  try {
    const { 
      locationId, 
      categoryId, 
      subcategoryId,
      brandId,
      unit
    } = req.query;

    // Build base product filters
    let productFilters = { 
      isDeleted: { $ne: true }
    };

    // Location filter
    if (locationId && locationId !== 'All') {
      productFilters.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Category filter
    if (categoryId && categoryId !== 'All') {
      // For main categories
      productFilters.category = new mongoose.Types.ObjectId(categoryId);
    }

    // Brand filter
    if (brandId && brandId !== 'All') {
      productFilters.brand = new mongoose.Types.ObjectId(brandId);
    }

    // Unit filter
    if (unit && unit !== 'All') {
      productFilters.unit = unit;
    }

    // Subcategory filter (need to get all products from categories that have this parent)
    if (subcategoryId && subcategoryId !== 'All') {
      // Find all categories with this parent
      const categories = await Category.find({ 
        parentCategory: new mongoose.Types.ObjectId(subcategoryId),
        isDeleted: { $ne: true } 
      }).select('_id');

      const categoryIds = categories.map(cat => cat._id);
      
      // Add the subcategory itself as it might have products directly
      categoryIds.push(new mongoose.Types.ObjectId(subcategoryId));
      
      // Update product filters to search in all these categories
      productFilters.category = { $in: categoryIds };
    }

    // Fetch all products with their related data
    const products = await Product.find(productFilters)
      .populate('brand')
      .populate('category')
      .populate('businessLocation')
      .lean();

    // Get sales data for calculating units sold
    const sales = await Sale.find({ isDeleted: { $ne: true } })
      .select('products')
      .populate({
        path: 'products.product',
        select: '_id'
      })
      .lean();

    // Get purchase data for accurate stock calculations
    const purchases = await Purchase.find({ isDeleted: { $ne: true } })
      .select('products')
      .populate({
        path: 'products.product',
        select: '_id'
      })
      .lean();

    // Process products and calculate values
    let stockItems = [];
    let totals = {
      currentStock: 0,
      currentStockValuePurchase: 0,
      currentStockValueSale: 0,
      potentialProfit: 0,
      totalUnitSold: 0,
      totalUnitTransferred: 0,
      totalUnitAdjusted: 0,
      customField1Total: 0,
      customField2Total: 0,
      customField3Total: 0,
      customField4Total: 0
    };

    for (const product of products) {
      // Calculate current stock (could be from product.quantity or by summing related Stock documents)
      const currentStock = product.quantity || 0;
      
      // Calculate stock values
      const purchasePrice = product.purchasePrice || 0;
      const sellingPrice = product.sellingPrice || 0;
      const currentStockValuePurchase = currentStock * purchasePrice;
      const currentStockValueSale = currentStock * sellingPrice;
      
      // Calculate potential profit
      const potentialProfit = currentStockValueSale - currentStockValuePurchase;
      
      // Calculate profit margin percentage
      const profitMargin = currentStockValuePurchase > 0 
        ? ((potentialProfit / currentStockValuePurchase) * 100).toFixed(2)
        : 0;

      // Calculate total units sold
      let totalUnitSold = 0;
      for (const sale of sales) {
        for (const saleProduct of sale.products) {
          if (saleProduct.product && saleProduct.product._id.toString() === product._id.toString()) {
            totalUnitSold += saleProduct.quantity || 0;
          }
        }
      }

      // For this example, we'll set these to 0 as they might require additional data sources
      const totalUnitTransferred = 0;
      const totalUnitAdjusted = 0;
      
      // Custom fields (would be replaced with actual values in a real implementation)
      const customField1 = 0;
      const customField2 = 0;
      const customField3 = 0;
      const customField4 = 0;
      
      // Add to totals
      totals.currentStock += currentStock;
      totals.currentStockValuePurchase += currentStockValuePurchase;
      totals.currentStockValueSale += currentStockValueSale;
      totals.potentialProfit += potentialProfit;
      totals.totalUnitSold += totalUnitSold;
      totals.totalUnitTransferred += totalUnitTransferred;
      totals.totalUnitAdjusted += totalUnitAdjusted;
      totals.customField1Total += customField1;
      totals.customField2Total += customField2;
      totals.customField3Total += customField3;
      totals.customField4Total += customField4;

      // Build stock item object
      stockItems.push({
        sku: product.sku,
        product: product.productName,
        variation: '', // Not shown in the image
        category: product.category ? product.category.name : '',
        location: product.businessLocation ? product.businessLocation.name : '',
        unitSellingPrice: sellingPrice,
        currentStock,
        currentStockValuePurchase,
        currentStockValueSale,
        potentialProfit,
        totalUnitSold,
        totalUnitTransferred,
        totalUnitAdjusted,
        customField1,
        customField2,
        customField3,
        customField4
      });
    }

    // Calculate overall profit margin
    const overallProfitMargin = totals.currentStockValuePurchase > 0
      ? ((totals.potentialProfit / totals.currentStockValuePurchase) * 100).toFixed(2)
      : 0;

    // Response with stock items and summary data
    res.status(200).json({
      summary: {
        closingStockPurchasePrice: totals.currentStockValuePurchase,
        closingStockSalePrice: totals.currentStockValueSale,
        potentialProfit: totals.potentialProfit,
        profitMarginPercentage: overallProfitMargin
      },
      items: stockItems,
      totals
    });

  } catch (err) {
    console.error('Error fetching stock report:', err);
    res.status(500).json({ error: err.message });
  }
};
