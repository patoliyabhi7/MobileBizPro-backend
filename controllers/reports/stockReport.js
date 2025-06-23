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

    console.log('Stock Report Query:', req.query);
    
    // Build base product filters
    let productFilters = { 
      isDeleted: false
    };

    // Location filter
    if (locationId && locationId !== 'All') {
      productFilters.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Category filter
    if (categoryId && categoryId !== 'All') {
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

    // Subcategory filter
    if (subcategoryId && subcategoryId !== 'All') {
      // Find all categories with this parent
      const categories = await Category.find({ 
        parentCategory: new mongoose.Types.ObjectId(subcategoryId),
        isDeleted: false
      }).select('_id');

      const categoryIds = categories.map(cat => cat._id);
      categoryIds.push(new mongoose.Types.ObjectId(subcategoryId));
      
      productFilters.category = { $in: categoryIds };
    }

    console.log('Product Filters:', JSON.stringify(productFilters, null, 2));

    // Get sales data for calculating units sold - use aggregation for efficiency
    const salesData = await Sale.aggregate([
      { 
        $match: { 
          isDeleted: false,
          ...(locationId && locationId !== 'All' ? 
            { businessLocation: new mongoose.Types.ObjectId(locationId) } : {})
        } 
      },
      { $unwind: '$products' },
      {
        $group: {
          _id: '$products.product',
          totalUnitSold: { $sum: '$products.quantity' }
        }
      }
    ]);
    
    console.log('Sales data aggregation result:', salesData.length);

    const soldQuantityByProduct = {};
    salesData.forEach(item => {
      if (item._id) {
        soldQuantityByProduct[item._id.toString()] = item.totalUnitSold || 0;
      }
    });
    
    // Approach 1: First try to get all products and calculate their stock
    const products = await Product.find(productFilters)
      .populate('brand')
      .populate('category')
      .populate('businessLocation')
      .lean();

    console.log(`Found ${products.length} products matching the criteria`);

    // Create a map of products by ID for faster lookup
    const productsMap = {};
    products.forEach(p => {
      productsMap[p._id.toString()] = p;
    });

    // Get stock data for all matching products
    const stockData = await Stock.aggregate([
      {
        $match: {
          quantity: { $gt: 0 },
          ...(locationId && locationId !== 'All' ? 
            { businessLocation: new mongoose.Types.ObjectId(locationId) } : {})
        }
      },
      {
        $group: {
          _id: '$product',
          totalStock: { $sum: '$quantity' },
          avgUnitCost: { $avg: '$unitCost' },
          variants: {
            $push: {
              _id: '$_id',
              quantity: '$quantity',
              unitCost: '$unitCost',
              imeiNo: '$imeiNo',
              serialNo: '$serialNo',
              color: '$color',
              storage: '$storage'
            }
          }
        }
      }
    ]);

    console.log(`Stock aggregation found data for ${stockData.length} products`);

    // Create a map of stock data by product ID
    const stockByProduct = {};
    stockData.forEach(s => {
      if (s._id) {
        stockByProduct[s._id.toString()] = s;
      }
    });

    // Process all products to generate the report
    let formattedStockItems = [];
    let totals = {
      currentStock: 0,
      currentStockValuePurchase: 0,
      currentStockValueSale: 0,
      potentialProfit: 0,
      totalUnitSold: 0,
      totalUnitTransferred: 0,
      totalUnitAdjusted: 0
    };

    // Debug variables to count items skipped
    let skippedNoProduct = 0;

    // Process ALL products, even if they have no stock
    for (const product of products) {
      const productId = product._id.toString();
      const stockInfo = stockByProduct[productId] || { totalStock: 0, avgUnitCost: 0, variants: [] };
      
      // Determine quantity from stock data or product data
      const currentStock = stockInfo.totalStock || Number(product.quantity) || 0;
      
      // Calculate values - even for zero stock products
      const purchasePrice = stockInfo.avgUnitCost || Number(product.purchasePrice) || 0;
      const sellingPrice = Number(product.sellingPrice) || 0;
      const currentStockValuePurchase = parseFloat((currentStock * purchasePrice).toFixed(2));
      const currentStockValueSale = parseFloat((currentStock * sellingPrice).toFixed(2));
      const potentialProfit = parseFloat((currentStockValueSale - currentStockValuePurchase).toFixed(2));
      
      // Calculate profit margin
      let profitMargin = 0;
      if (currentStockValuePurchase > 0) {
        profitMargin = parseFloat(((potentialProfit / currentStockValuePurchase) * 100).toFixed(2));
      }

      // Get sales data
      const totalUnitSold = Number(soldQuantityByProduct[productId] || 0);
      
      // Add to totals - but only for products with stock
      if (currentStock > 0) {
        totals.currentStock += currentStock;
        totals.currentStockValuePurchase += currentStockValuePurchase;
        totals.currentStockValueSale += currentStockValueSale;
        totals.potentialProfit += potentialProfit;
      }
      totals.totalUnitSold += totalUnitSold;

      // If there are variants, add each as a separate item
      if (stockInfo.variants && stockInfo.variants.length > 0) {
        for (const variant of stockInfo.variants) {
          // Calculate variant-specific values
          const variantStock = Number(variant.quantity) || 0;
          const variantPurchasePrice = Number(variant.unitCost) || purchasePrice;
          const variantStockValuePurchase = parseFloat((variantStock * variantPurchasePrice).toFixed(2));
          const variantStockValueSale = parseFloat((variantStock * sellingPrice).toFixed(2));
          const variantPotentialProfit = parseFloat((variantStockValueSale - variantStockValuePurchase).toFixed(2));
          
          let variantProfitMargin = 0;
          if (variantStockValuePurchase > 0) {
            variantProfitMargin = parseFloat(((variantPotentialProfit / variantStockValuePurchase) * 100).toFixed(2));
          }

          // Add variant item
          formattedStockItems.push({
            sku: product.sku || '',
            product: product.productName || 'Unknown Product',
            variation: variant.color ? `${variant.color} ${variant.storage || ''}` : '',
            imeiNo: variant.imeiNo || '',
            serialNo: variant.serialNo || '',
            category: product.category ? product.category.name : '',
            location: product.businessLocation ? product.businessLocation.name : '',
            unitPurchasePrice: parseFloat(variantPurchasePrice.toFixed(2)),
            unitSellingPrice: parseFloat(sellingPrice.toFixed(2)),
            currentStock: variantStock,
            currentStockValuePurchase: variantStockValuePurchase,
            currentStockValueSale: variantStockValueSale,
            potentialProfit: variantPotentialProfit,
            profitMargin: variantProfitMargin,
            totalUnitSold, // We don't have variant-specific sales data
            totalUnitTransferred: 0,
            totalUnitAdjusted: 0
          });
        }
      } else {
        // Add product as a single item - ALWAYS add the product, even with zero stock
        formattedStockItems.push({
          sku: product.sku || '',
          product: product.productName || 'Unknown Product',
          variation: '',
          imeiNo: '',
          serialNo: '',
          category: product.category ? product.category.name : '',
          location: product.businessLocation ? product.businessLocation.name : '',
          unitPurchasePrice: parseFloat(purchasePrice.toFixed(2)),
          unitSellingPrice: parseFloat(sellingPrice.toFixed(2)),
          currentStock,
          currentStockValuePurchase,
          currentStockValueSale,
          potentialProfit,
          profitMargin,
          totalUnitSold,
          totalUnitTransferred: 0,
          totalUnitAdjusted: 0
        });
      }
    }

    // If we still don't have any products, modify the product query to get ALL products
    if (formattedStockItems.length === 0) {
      console.log("No products found with current filters, trying to get all products");
      
      try {
        // Get all non-deleted products regardless of other filters
        const allProducts = await Product.find({ 
          isDeleted: false
        }).populate('brand').populate('category').populate('businessLocation').lean();
        
        console.log(`Found ${allProducts.length} total products in the database`);
        
        for (const product of allProducts) {
          const productId = product._id.toString();
          
          // Calculate values for display
          const currentStock = Number(product.quantity) || 0;
          const purchasePrice = Number(product.purchasePrice) || 0;
          const sellingPrice = Number(product.sellingPrice) || 0;
          const currentStockValuePurchase = parseFloat((currentStock * purchasePrice).toFixed(2));
          const currentStockValueSale = parseFloat((currentStock * sellingPrice).toFixed(2));
          const potentialProfit = parseFloat((currentStockValueSale - currentStockValuePurchase).toFixed(2));
          
          let profitMargin = 0;
          if (currentStockValuePurchase > 0) {
            profitMargin = parseFloat(((potentialProfit / currentStockValuePurchase) * 100).toFixed(2));
          }
          
          const totalUnitSold = Number(soldQuantityByProduct[productId] || 0);
          
          formattedStockItems.push({
            sku: product.sku || '',
            product: product.productName || 'Unknown Product',
            variation: '',
            imeiNo: '',
            serialNo: '',
            category: product.category ? product.category.name : '',
            location: product.businessLocation ? product.businessLocation.name : '',
            unitPurchasePrice: parseFloat(purchasePrice.toFixed(2)),
            unitSellingPrice: parseFloat(sellingPrice.toFixed(2)),
            currentStock,
            currentStockValuePurchase,
            currentStockValueSale,
            potentialProfit,
            profitMargin,
            totalUnitSold,
            totalUnitTransferred: 0,
            totalUnitAdjusted: 0
          });
        }
      } catch (allProductsErr) {
        console.error('Error getting all products:', allProductsErr);
      }
    }

    // Calculate overall profit margin more accurately
    let overallProfitMargin = 0;
    if (totals.currentStockValuePurchase > 0) {
      overallProfitMargin = parseFloat(((totals.potentialProfit / totals.currentStockValuePurchase) * 100).toFixed(2));
    }

    // Round totals for consistency
    Object.keys(totals).forEach(key => {
      if (typeof totals[key] === 'number') {
        totals[key] = parseFloat(totals[key].toFixed(2));
      }
    });

    console.log(`Returning ${formattedStockItems.length} stock items in the report`);
    
    if (skippedNoProduct > 0) {
      console.log(`DEBUG: Skipped items - No Product: ${skippedNoProduct}`);
    }
    
    // Response with stock items and summary data
    res.status(200).json({
      summary: {
        closingStockPurchasePrice: parseFloat(totals.currentStockValuePurchase.toFixed(2)),
        closingStockSalePrice: parseFloat(totals.currentStockValueSale.toFixed(2)),
        potentialProfit: parseFloat(totals.potentialProfit.toFixed(2)),
        profitMarginPercentage: overallProfitMargin
      },
      items: formattedStockItems,
      totals
    });

  } catch (err) {
    console.error('Error fetching stock report:', err);
    res.status(500).json({ error: err.message });
  }
};
              