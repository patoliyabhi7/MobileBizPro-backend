const Stock = require('../../models/stockModel');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');
const BusinessLocation = require('../../models/businessLocationModel');
const Brand = require('../../models/brandModel');
const Sale = require('../../models/saleModel');
const Purchase = require('../../models/purchaseModel');
const SaleReturn = require('../../models/saleReturnModel');
const PurchaseReturn = require('../../models/purchaseReturnModel');
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

    // Get sale returns data
    const saleReturnsData = await SaleReturn.aggregate([
      { 
        $match: { 
          isDeleted: false,
          ...(locationId && locationId !== 'All' ? 
            { businessLocation: new mongoose.Types.ObjectId(locationId) } : {})
        } 
      },
      { $unwind: '$returnedProducts' },
      {
        $group: {
          _id: '$returnedProducts.product',
          totalUnitReturned: { $sum: '$returnedProducts.quantity' }
        }
      }
    ]);
    
    console.log('Sale returns data aggregation result:', saleReturnsData.length);
    
    // Get purchase returns data
    const purchaseReturnsData = await PurchaseReturn.aggregate([
      { 
        $match: { 
          isDeleted: false,
          ...(locationId && locationId !== 'All' ? 
            { businessLocation: new mongoose.Types.ObjectId(locationId) } : {})
        } 
      },
      { $unwind: '$returnedProducts' },
      {
        $group: {
          _id: '$returnedProducts.product',
          totalUnitReturned: { $sum: '$returnedProducts.quantity' }
        }
      }
    ]);
    
    console.log('Purchase returns data aggregation result:', purchaseReturnsData.length);

    const soldQuantityByProduct = {};
    salesData.forEach(item => {
      if (item._id) {
        soldQuantityByProduct[item._id.toString()] = item.totalUnitSold || 0;
      }
    });
    
    // Create maps for return data
    const saleReturnsByProduct = {};
    saleReturnsData.forEach(item => {
      if (item._id) {
        saleReturnsByProduct[item._id.toString()] = item.totalUnitReturned || 0;
      }
    });
    
    const purchaseReturnsByProduct = {};
    purchaseReturnsData.forEach(item => {
      if (item._id) {
        purchaseReturnsByProduct[item._id.toString()] = item.totalUnitReturned || 0;
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
          ...(locationId && locationId !== 'All' ? 
            { businessLocation: new mongoose.Types.ObjectId(locationId) } : {})
        }
      },
      {
        $group: {
          _id: '$product',
          totalStock: { $sum: '$quantity' },
          avgUnitCost: { $avg: { $cond: [{ $gt: ['$unitCost', 0] }, '$unitCost', null] } }, // Only average non-zero prices
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

    // Get purchase data to find original purchase prices
    const purchaseData = await Purchase.aggregate([
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
          avgPurchasePrice: { $avg: '$products.unitCost' }
        }
      }
    ]);

    // Create map for purchase data
    const purchasePriceByProduct = {};
    purchaseData.forEach(p => {
      if (p._id) {
        purchasePriceByProduct[p._id.toString()] = p.avgPurchasePrice || 0;
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
      totalUnitAdjusted: 0,
      totalUnitReturned: 0,
      totalPurchaseReturned: 0
    };

    // Debug variables to count items skipped
    let skippedNoProduct = 0;

    // Process ALL products, even if they have no stock
    for (const product of products) {
      const productId = product._id.toString();
      const stockInfo = stockByProduct[productId] || { totalStock: 0, avgUnitCost: 0, variants: [] };
      
      // Get sales returns (items returned by customers)
      const saleReturnsQty = Number(saleReturnsByProduct[productId] || 0);
      
      // Get purchase returns (items returned to suppliers)
      const purchaseReturnsQty = Number(purchaseReturnsByProduct[productId] || 0);
      
      // Calculate total units sold accounting for returns
      const totalSold = Number(soldQuantityByProduct[productId] || 0);
      const effectiveTotalSold = Math.max(0, totalSold - saleReturnsQty);
      
      // Determine quantity from stock data or product data
      let currentStock = stockInfo.totalStock || Number(product.quantity) || 0;
      
      // Calculate values - use multiple sources for purchase price to ensure we have data
      // First check stockInfo, then purchasePriceByProduct, then fallback to product.purchasePrice
      const purchasePrice = 
        (stockInfo.avgUnitCost && stockInfo.avgUnitCost > 0) ? stockInfo.avgUnitCost : 
        (purchasePriceByProduct[productId] && purchasePriceByProduct[productId] > 0) ? purchasePriceByProduct[productId] : 
        Number(product.purchasePrice) || 0;
      
      // Make sure we have a selling price
      const sellingPrice = Number(product.sellingPrice) || 0;
      
      console.log(`Product ${product.productName}: Purchase Price = ${purchasePrice}, Selling Price = ${sellingPrice}`);
      
      const currentStockValuePurchase = parseFloat((currentStock * purchasePrice).toFixed(2));
      const currentStockValueSale = parseFloat((currentStock * sellingPrice).toFixed(2));
      const potentialProfit = parseFloat((currentStockValueSale - currentStockValuePurchase).toFixed(2));
      
      // Calculate profit margin
      let profitMargin = 0;
      if (currentStockValuePurchase > 0) {
        profitMargin = parseFloat(((potentialProfit / currentStockValuePurchase) * 100).toFixed(2));
      }

      // Add to totals
      totals.currentStock += currentStock;
      totals.currentStockValuePurchase += currentStockValuePurchase;
      totals.currentStockValueSale += currentStockValueSale;
      totals.potentialProfit += potentialProfit;
      totals.totalUnitSold += effectiveTotalSold;
      totals.totalUnitReturned += saleReturnsQty;
      totals.totalPurchaseReturned += purchaseReturnsQty;

      // If there are variants, add each as a separate item
      if (stockInfo.variants && stockInfo.variants.length > 0 && stockInfo.variants.some(v => v.quantity > 0)) {
        for (const variant of stockInfo.variants) {
          // Skip variants with zero quantity
          if (variant.quantity <= 0) continue;
          
          // Calculate variant-specific values
          const variantStock = Number(variant.quantity) || 0;
          const variantPurchasePrice = (variant.unitCost && variant.unitCost > 0) ? 
            Number(variant.unitCost) : purchasePrice;
          
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
            totalUnitSold: effectiveTotalSold,
            totalUnitReturned: saleReturnsQty,
            totalPurchaseReturned: purchaseReturnsQty,
            totalUnitTransferred: 0,
            totalUnitAdjusted: 0
          });
        }
      } else {
        // Only add products with stock or sales
        if (currentStock > 0 || effectiveTotalSold > 0 || saleReturnsQty > 0 || purchaseReturnsQty > 0) {
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
            totalUnitSold: effectiveTotalSold,
            totalUnitReturned: saleReturnsQty,
            totalPurchaseReturned: purchaseReturnsQty,
            totalUnitTransferred: 0,
            totalUnitAdjusted: 0
          });
        }
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
          
          // Get sales returns (items returned by customers)
          const saleReturnsQty = Number(saleReturnsByProduct[productId] || 0);
          
          // Get purchase returns (items returned to suppliers)
          const purchaseReturnsQty = Number(purchaseReturnsByProduct[productId] || 0);
          
          // Calculate total units sold accounting for returns
          const totalSold = Number(soldQuantityByProduct[productId] || 0);
          const effectiveTotalSold = Math.max(0, totalSold - saleReturnsQty);
          
          // Calculate values for display
          const stockInfo = stockByProduct[productId] || { totalStock: 0, avgUnitCost: 0, variants: [] };
          const currentStock = stockInfo.totalStock || Number(product.quantity) || 0;
          const purchasePrice = stockInfo.avgUnitCost || Number(product.purchasePrice) || 0;
          const sellingPrice = Number(product.sellingPrice) || 0;
          const currentStockValuePurchase = parseFloat((currentStock * purchasePrice).toFixed(2));
          const currentStockValueSale = parseFloat((currentStock * sellingPrice).toFixed(2));
          const potentialProfit = parseFloat((currentStockValueSale - currentStockValuePurchase).toFixed(2));
          
          let profitMargin = 0;
          if (currentStockValuePurchase > 0) {
            profitMargin = parseFloat(((potentialProfit / currentStockValuePurchase) * 100).toFixed(2));
          }
          
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
            totalUnitSold: effectiveTotalSold,
            totalUnitReturned: saleReturnsQty,
            totalPurchaseReturned: purchaseReturnsQty,
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
