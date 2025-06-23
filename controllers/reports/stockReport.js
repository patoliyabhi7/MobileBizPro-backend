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
      isDeleted: false // Changed from { $ne: true } to directly false for consistency
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
        isDeleted: false
      }).select('_id');

      const categoryIds = categories.map(cat => cat._id);
      
      // Add the subcategory itself as it might have products directly
      categoryIds.push(new mongoose.Types.ObjectId(subcategoryId));
      
      // Update product filters to search in all these categories
      productFilters.category = { $in: categoryIds };
    }

    console.log('Product Filters:', JSON.stringify(productFilters, null, 2));

    // Fetch all products with their related data
    const products = await Product.find(productFilters)
      .populate('brand')
      .populate('category')
      .populate('businessLocation')
      .lean();

    console.log(`Found ${products.length} products matching the criteria`);

    // If no products found, check if there are any products in the system
    if (products.length === 0) {
      const totalProductCount = await Product.countDocuments({ isDeleted: false });
      console.log(`Total non-deleted products in the system: ${totalProductCount}`);
      
      if (totalProductCount > 0) {
        // Get sample products to verify data structure
        const sampleProduct = await Product.findOne({ isDeleted: false }).lean();
        console.log('Sample product structure:', JSON.stringify(sampleProduct, null, 2));
        
        // Explicitly try to get stock items without any filters to see if they exist
        const anyStockItems = await Stock.find({}).limit(5).lean();
        console.log('Available stock items:', anyStockItems.length > 0 ? 
          JSON.stringify(anyStockItems.slice(0, 2), null, 2) : 'No stock items found');
      }
    }

    // Directly fetch stock information for efficiency
    const stockItems = await Stock.find({
      // Note: Stock model might not have isDeleted field, removing this filter
      quantity: { $gt: 0 }, // Only include items with stock
      // If locationId is provided, filter by it
      ...(locationId && locationId !== 'All' ? { businessLocation: new mongoose.Types.ObjectId(locationId) } : {})
    }).populate({
      path: 'product',
      match: { isDeleted: false }, // Filter only non-deleted products
      populate: [
        { path: 'brand' },
        { path: 'category' },
        { path: 'businessLocation' }
      ]
    }).lean();
    
    console.log('Stock query result:', stockItems.length > 0 ? 'Found items' : 'No items found');

    console.log(`Found ${stockItems.length} stock items with quantity > 0`);

    // Get sales data for calculating units sold - use aggregation for efficiency
    const salesData = await Sale.aggregate([
      { 
        $match: { 
          isDeleted: false 
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
    
    console.log(`Calculated sales data for ${Object.keys(soldQuantityByProduct).length} products`);

    // Process stock items and calculate values
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
    
    // DEBUG: Log first 2 stock items to see their structure after population
    if (stockItems.length > 0) {
      const sampleItems = stockItems.slice(0, 2).map(item => ({
        id: item._id.toString(),
        product: item.product ? {
          id: item.product._id.toString(),
          name: item.product.productName,
          hasCategory: !!item.product.category,
          hasBrand: !!item.product.brand
        } : null,
        quantity: item.quantity,
        unitCost: item.unitCost
      }));
      console.log('DEBUG: Sample populated stock items:', JSON.stringify(sampleItems, null, 2));
    }

    console.log(`DEBUG: Processing ${stockItems.length} stock items`);
    let skippedNoProduct = 0;
    let skippedNoStock = 0;
    
    for (const item of stockItems) {
      // Skip items whose product is null (could be deleted)
      if (!item.product) {
        skippedNoProduct++;
        continue;
      }
      
      const product = item.product;
      const currentStock = item.quantity || 0;
      
      // Skip items with no stock
      if (currentStock <= 0) {
        skippedNoStock++;
        continue;
      }
      
      console.log(`DEBUG: Processing stock item - Product: ${product.productName}, Quantity: ${currentStock}`);
      
      // Use product.purchasePrice as fallback if item.unitCost is not available
      const purchasePrice = item.unitCost || product.purchasePrice || 0;
      const sellingPrice = product.sellingPrice || 0;
      const currentStockValuePurchase = currentStock * purchasePrice;
      const currentStockValueSale = currentStock * sellingPrice;
      const potentialProfit = currentStockValueSale - currentStockValuePurchase;
      
      // Calculate profit margin percentage
      const profitMargin = currentStockValuePurchase > 0 
        ? ((potentialProfit / currentStockValuePurchase) * 100).toFixed(2)
        : 0;

      // Get units sold from pre-calculated map
      const totalUnitSold = soldQuantityByProduct[product._id.toString()] || 0;
      
      // For this example, we'll set these to 0 as they might require additional data sources
      const totalUnitTransferred = 0;
      const totalUnitAdjusted = 0;
      
      // Add to totals
      totals.currentStock += currentStock;
      totals.currentStockValuePurchase += currentStockValuePurchase;
      totals.currentStockValueSale += currentStockValueSale;
      totals.potentialProfit += potentialProfit;
      totals.totalUnitSold += totalUnitSold;
      totals.totalUnitTransferred += totalUnitTransferred;
      totals.totalUnitAdjusted += totalUnitAdjusted;

      // Build stock item object
      formattedStockItems.push({
        sku: product.sku,
        product: product.productName,
        variation: item.color ? `${item.color} ${item.storage || ''}` : '',
        imeiNo: item.imeiNo,
        serialNo: item.serialNo,
        category: product.category ? product.category.name : '',
        location: product.businessLocation ? product.businessLocation.name : '',
        unitPurchasePrice: purchasePrice,
        unitSellingPrice: sellingPrice,
        currentStock,
        currentStockValuePurchase,
        currentStockValueSale,
        potentialProfit,
        profitMargin,
        totalUnitSold,
        totalUnitTransferred,
        totalUnitAdjusted
      });
    }

    // Try product-based calculation as fallback if stock-based calculation yielded no results
    if (formattedStockItems.length === 0) {
      console.log("No stock items found, trying alternative approaches");
      
      // DEBUG: Let's find any stock items without filters to understand the issue
      const allStocks = await Stock.find({}).limit(10).lean();
      console.log(`DEBUG: Total unfiltered stock items: ${allStocks.length}`);
      
      if (allStocks.length > 0) {
        console.log('DEBUG: Sample stock item:', JSON.stringify(allStocks[0], null, 2));
        
        // Check if any stock has the quantity field properly set
        const stocksWithQuantity = allStocks.filter(s => s.quantity && s.quantity > 0);
        console.log(`DEBUG: Stock items with quantity > 0: ${stocksWithQuantity.length}`);
        
        // Check if stock items have product references
        const stocksWithProduct = allStocks.filter(s => s.product);
        console.log(`DEBUG: Stock items with product reference: ${stocksWithProduct.length}`);
        
        // Check if location filter might be causing issues
        if (locationId && locationId !== 'All') {
          const stocksWithLocation = allStocks.filter(
            s => s.businessLocation && s.businessLocation.toString() === locationId
          );
          console.log(`DEBUG: Stock items matching location filter: ${stocksWithLocation.length}`);
        }
      }
      
      // Try direct approach with manual population
      console.log("Attempting manual population approach...");
        try {
          // Get stock items first
          const manualStockItems = await Stock.find({ 
            quantity: { $gt: 0 }
          }).lean();
          
          console.log(`Found ${manualStockItems.length} stock items with quantity > 0`);
          
          // Get all product IDs from stock items
          const productIds = [...new Set(manualStockItems
            .filter(item => item.product)
            .map(item => item.product.toString()))];
          
          console.log(`Found ${productIds.length} unique product IDs in stock`);
          
          // Fetch all these products
          const productsMap = {};
          if (productIds.length > 0) {
            const stockProducts = await Product.find({ 
              _id: { $in: productIds },
              isDeleted: false
            }).populate('brand').populate('category').populate('businessLocation').lean();
            
            console.log(`Fetched ${stockProducts.length} products for stock items`);
            
            // Create a map for quick lookup
            stockProducts.forEach(p => {
              productsMap[p._id.toString()] = p;
            });
          }
          
          // Now process each stock item with its product
          for (const stockItem of manualStockItems) {
            if (!stockItem.product) continue;
            
            const productId = stockItem.product.toString();
            const product = productsMap[productId];
            
            if (!product) {
              console.log(`Product not found for stock item: ${productId}`);
              continue;
            }
            
            const currentStock = stockItem.quantity || 0;
            if (currentStock <= 0) continue;
            
            const purchasePrice = stockItem.unitCost || product.purchasePrice || 0;
            const sellingPrice = product.sellingPrice || 0;
            const currentStockValuePurchase = currentStock * purchasePrice;
            const currentStockValueSale = currentStock * sellingPrice;
            const potentialProfit = currentStockValueSale - currentStockValuePurchase;
            
            // Get units sold from pre-calculated map
            const totalUnitSold = soldQuantityByProduct[productId] || 0;
            
            // Add to totals
            totals.currentStock += currentStock;
            totals.currentStockValuePurchase += currentStockValuePurchase;
            totals.currentStockValueSale += currentStockValueSale;
            totals.potentialProfit += potentialProfit;
            totals.totalUnitSold += totalUnitSold;
            
            formattedStockItems.push({
              sku: product.sku,
              product: product.productName,
              variation: stockItem.color ? `${stockItem.color} ${stockItem.storage || ''}` : '',
              imeiNo: stockItem.imeiNo,
              serialNo: stockItem.serialNo,
              category: product.category ? product.category.name : '',
              location: product.businessLocation ? product.businessLocation.name : '',
              unitPurchasePrice: purchasePrice,
              unitSellingPrice: sellingPrice,
              currentStock,
              currentStockValuePurchase,
              currentStockValueSale,
              potentialProfit,
              profitMargin: currentStockValuePurchase > 0 
                ? ((potentialProfit / currentStockValuePurchase) * 100).toFixed(2)
                : 0,
              totalUnitSold,
              totalUnitTransferred: 0,
              totalUnitAdjusted: 0
            });
          }
          
          console.log(`Added ${formattedStockItems.length} items using manual population`);
        } catch (manualErr) {
          console.error('Error in manual population attempt:', manualErr);
        }
      }
      
      // Final fallback - use product quantities directly
      if (formattedStockItems.length === 0 && products.length > 0) {
        console.log("Falling back to product-based calculation as last resort");
      
      
      for (const product of products) {
        // Skip if product has no quantity
        if (!product.quantity || product.quantity <= 0) continue;
        
        const currentStock = product.quantity || 0;
        const purchasePrice = product.purchasePrice || 0;
        const sellingPrice = product.sellingPrice || 0;
        const currentStockValuePurchase = currentStock * purchasePrice;
        const currentStockValueSale = currentStock * sellingPrice;
        const potentialProfit = currentStockValueSale - currentStockValuePurchase;
        
        // Calculate profit margin percentage
        const profitMargin = currentStockValuePurchase > 0 
          ? ((potentialProfit / currentStockValuePurchase) * 100).toFixed(2)
          : 0;

        // Get units sold from pre-calculated map
        const totalUnitSold = soldQuantityByProduct[product._id.toString()] || 0;
        
        // Add to totals
        totals.currentStock += currentStock;
        totals.currentStockValuePurchase += currentStockValuePurchase;
        totals.currentStockValueSale += currentStockValueSale;
        totals.potentialProfit += potentialProfit;
        totals.totalUnitSold += totalUnitSold;

        // Build stock item object
        formattedStockItems.push({
          sku: product.sku,
          product: product.productName,
          variation: '',
          category: product.category ? product.category.name : '',
          location: product.businessLocation ? product.businessLocation.name : '',
          unitPurchasePrice: purchasePrice,
          unitSellingPrice: sellingPrice,
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

    // Calculate overall profit margin
    const overallProfitMargin = totals.currentStockValuePurchase > 0
      ? ((totals.potentialProfit / totals.currentStockValuePurchase) * 100).toFixed(2)
      : 0;

    console.log(`Returning ${formattedStockItems.length} stock items in the report`);
    
    if (skippedNoProduct > 0 || skippedNoStock > 0) {
      console.log(`DEBUG: Skipped items - No Product: ${skippedNoProduct}, No Stock: ${skippedNoStock}`);
    }
    
    // Response with stock items and summary data
    res.status(200).json({
      summary: {
        closingStockPurchasePrice: totals.currentStockValuePurchase,
        closingStockSalePrice: totals.currentStockValueSale,
        potentialProfit: totals.potentialProfit,
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
