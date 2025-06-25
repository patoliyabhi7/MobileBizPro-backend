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
    let {
      locationId,
      categoryId,
      subcategoryId,
      brandId,
      unit
    } = req.query;

    console.log('Stock Report Query:', req.query);

    // Standardize "All" values to handle different formats from frontend
    const isAllValue = (value) => {
      return !value || value === 'all' || value === 'All' || value === 'ALL' || value === '';
    };
    
    // Build base product filters - get ALL products matching brand/category filters
    // Do NOT filter by businessLocation here - we want all products
    let productFilters = {
      isDeleted: false
    };

    // Category filter
    if (!isAllValue(categoryId)) {
      try {
      productFilters.category = new mongoose.Types.ObjectId(categoryId);
        console.log(`Applied category filter: ${categoryId}`);
      } catch (err) {
        console.error(`Invalid category ID: ${categoryId}`, err.message);
        // Continue without this filter if invalid
      }
    }

    // Brand filter
    if (!isAllValue(brandId)) {
      try {
      productFilters.brand = new mongoose.Types.ObjectId(brandId);
        console.log(`Applied brand filter: ${brandId}`);
      } catch (err) {
        console.error(`Invalid brand ID: ${brandId}`, err.message);
        // Continue without this filter if invalid
      }
    }

    // Unit filter
    if (!isAllValue(unit)) {
      productFilters.unit = unit;
      console.log(`Applied unit filter: ${unit}`);
    }

    // Subcategory filter
    if (!isAllValue(subcategoryId)) {
      try {
      // Find all categories with this parent
        const subcatObjId = new mongoose.Types.ObjectId(subcategoryId);
      const categories = await Category.find({
          parentCategory: subcatObjId,
        isDeleted: false
      }).select('_id');

      const categoryIds = categories.map(cat => cat._id);
        categoryIds.push(subcatObjId);

      productFilters.category = { $in: categoryIds };
        console.log(`Applied subcategory filter: ${subcategoryId} with ${categories.length} child categories`);
      } catch (err) {
        console.error(`Invalid subcategory ID: ${subcategoryId}`, err.message);
        // Continue without this filter if invalid
      }
    }

    // Create location filter ONLY for transaction data (purchase, sale, stock, etc.)
    // This will filter the actual transactions by location, not the products themselves
    const locationFilter = !isAllValue(locationId)
      ? { businessLocation: new mongoose.Types.ObjectId(locationId) } 
      : {};

    console.log('Product Filters:', JSON.stringify(productFilters, null, 2));
    console.log('Location Filter:', JSON.stringify(locationFilter, null, 2));

    // Get all products that match our criteria (brand/category filters only)
    // Note: We do NOT filter by location here - we want ALL products
    const products = await Product.find(productFilters)
      .populate('brand')
      .populate('category')
      .populate('businessLocation')
      .lean();

    console.log(`Found ${products.length} products matching brand/category criteria (before location filtering of transactions)`);
    console.log(`Location filter will be applied only to transaction data (sales, purchases, stock), not to product list`);
    
    // Log details about the first few products for debugging
    if (products.length > 0) {
      console.log('Sample products:');
      products.slice(0, 3).forEach(p => {
        console.log(`- ${p.productName} (ID: ${p._id})`);
        console.log(`  Category: ${p.category ? p.category._id + ' - ' + p.category.name : 'none'}`);
        console.log(`  Brand: ${p.brand ? p.brand._id + ' - ' + p.brand.name : 'none'}`);
      });
    } else if (brandId !== 'All' || categoryId !== 'All') {
      console.log('No products found with these filters, checking if category/brand exists:');
      if (brandId !== 'All') {
        try {
          const brand = await mongoose.model('Brand').findById(brandId);
          console.log(`Brand ${brandId} exists: ${brand ? 'Yes' : 'No'}`);
        } catch (err) {
          console.log(`Error checking brand: ${err.message}`);
        }
      }
      if (categoryId !== 'All') {
        try {
          const category = await Category.findById(categoryId);
          console.log(`Category ${categoryId} exists: ${category ? 'Yes' : 'No'}`);
        } catch (err) {
          console.log(`Error checking category: ${err.message}`);
        }
      }
    }

    // Create array of product IDs for filtering in other queries
    const productIds = products.map(p => p._id);

    // Get sales data for calculating units sold - use aggregation for efficiency
    const salesData = await Sale.aggregate([
      {
        $match: {
          isDeleted: false,
          ...locationFilter
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.product': { $in: productIds }
        }
      },
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
          ...locationFilter
        }
      },
      { $unwind: '$returnedProducts' },
      {
        $match: {
          'returnedProducts.product': { $in: productIds }
        }
      },
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
          ...locationFilter
        }
      },
      { $unwind: '$returnedProducts' },
      {
        $match: {
          'returnedProducts.product': { $in: productIds }
        }
      },
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

    // Create a map of products by ID for faster lookup
    const productsMap = {};
    products.forEach(p => {
      productsMap[p._id.toString()] = p;
    });

    // Get stock data for all matching products
    const stockData = await Stock.aggregate([
      {
        $match: {
          product: { $in: productIds },
          ...locationFilter,
          quantity: { $gt: 0 } // Only include items with positive stock
        }
      },
      {
        $group: {
          _id: '$product',
          totalStock: { $sum: '$quantity' },
          totalPurchaseValue: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
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

    console.log(`Stock aggregation found data for ${stockData.length} products with stock in the location filter`);
    
    // Important: Even if a product has no stock in this location, we still want to show it
    // in the report if it matches brand/category filters. It will just show 0 stock.

    // Create a map of stock data by product ID
    const stockByProduct = {};
    stockData.forEach(s => {
      if (s._id) {
        // Calculate the average unit cost properly if we have total values
        if (s.totalStock > 0 && s.totalPurchaseValue > 0) {
          s.avgUnitCost = s.totalPurchaseValue / s.totalStock;
        }
        stockByProduct[s._id.toString()] = s;
      }
    });

    // Get purchase data to find original purchase prices
    const purchaseData = await Purchase.aggregate([
      {
        $match: {
          isDeleted: false,
          ...locationFilter
        }
      },
      { $unwind: '$products' },
      {
        $match: {
          'products.product': { $in: productIds }
        }
      },
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

    // Calculate closing stock directly from stock items for accuracy
    // This mirrors the approach used in profitLossReport.js
    const calculateClosingStock = async () => {
      try {
        console.log('Calculating closing stock value');

        // Create a filter to get all stock items with the location filter
        // Important: We filter stock by location, but not products by location
        const stockFilter = {
          product: { $in: productIds },
          ...locationFilter,
          quantity: { $gt: 0 } // Only include items with stock
        };

        console.log('Stock filter:', JSON.stringify(stockFilter, null, 2));

        // Get all stock items with the filter
        const stocks = await Stock.find(stockFilter).populate('product');

        console.log(`Found ${stocks.length} stock items for closing stock calculation`);

        let purchaseValue = 0;
        let saleValue = 0;

        // Create a map to store stock values by product for individual item calculations
        const stockValuesByProduct = {};

        // Calculate stock values based on the quantity field in stock model
        for (const stock of stocks) {
          if (stock.product) {
            const stockQty = stock.quantity || 0;
            const unitCost = stock.unitCost || 0;
            const sellingPrice = stock.product.sellingPrice || 0;

            if (stockQty > 0) {
              purchaseValue += stockQty * unitCost;
              saleValue += stockQty * sellingPrice;

              // Store the stock values by product for individual item calculations
              const productId = stock.product._id.toString();
              if (!stockValuesByProduct[productId]) {
                stockValuesByProduct[productId] = {
                  purchaseValue: 0,
                  saleValue: 0,
                  quantity: 0,
                  avgUnitCost: 0,
                  productName: stock.product.productName || '',
                  sku: stock.product.sku || '',
                  sellingPrice: sellingPrice
                };
              }
              stockValuesByProduct[productId].purchaseValue += stockQty * unitCost;
              stockValuesByProduct[productId].saleValue += stockQty * sellingPrice;
              stockValuesByProduct[productId].quantity += stockQty;

              // Update average unit cost after adding new values
              if (stockValuesByProduct[productId].quantity > 0) {
                stockValuesByProduct[productId].avgUnitCost =
                  stockValuesByProduct[productId].purchaseValue / stockValuesByProduct[productId].quantity;
              }

              console.log(`Stock item: Product=${stock.product.productName}, Qty=${stockQty}, UnitCost=${unitCost}, SellingPrice=${sellingPrice}`);
            }
          }
        }

        console.log(`Closing stock calculated: Purchase value: ${purchaseValue}, Sale value: ${saleValue}`);
        return { purchaseValue, saleValue, stockValuesByProduct };
      } catch (error) {
        console.error('Error calculating closing stock:', error);
        return { purchaseValue: 0, saleValue: 0, stockValuesByProduct: {} };
      }
    };

    // Get accurate closing stock values
    const closingStock = await calculateClosingStock();

    // Debug variables to count items skipped
    let skippedNoProduct = 0;

    // Process ALL products, even if they have no stock
    for (const product of products) {
      const productId = product._id.toString();
      const stockInfo = stockByProduct[productId] || { totalStock: 0, avgUnitCost: 0, totalPurchaseValue: 0, variants: [] };

      // Get sales returns (items returned by customers)
      const saleReturnsQty = Number(saleReturnsByProduct[productId] || 0);

      // Get purchase returns (items returned to suppliers)
      const purchaseReturnsQty = Number(purchaseReturnsByProduct[productId] || 0);

      // Calculate total units sold accounting for returns
      const totalSold = Number(soldQuantityByProduct[productId] || 0);
      const effectiveTotalSold = Math.max(0, totalSold - saleReturnsQty);

      // Get stock values directly from closing stock calculation for consistency
      const productStockValues = closingStock.stockValuesByProduct[productId] || {
        purchaseValue: 0,
        saleValue: 0,
        quantity: 0,
        avgUnitCost: 0,
        sellingPrice: 0
      };

      // Determine quantity from stock calculation first, then stock data, then product data
      let currentStock = productStockValues.quantity > 0
        ? productStockValues.quantity
        : (stockInfo.totalStock || Number(product.quantity) || 0);

      // Calculate purchase price using multiple sources for accuracy
      let purchasePrice = 0;
      // First check stock calculation
      if (productStockValues.quantity > 0 && productStockValues.avgUnitCost > 0) {
        purchasePrice = productStockValues.avgUnitCost;
      }
      // Then check stock aggregation 
      else if (stockInfo.avgUnitCost && stockInfo.avgUnitCost > 0) {
        purchasePrice = stockInfo.avgUnitCost;
      }
      // Then check purchase data
      else if (purchasePriceByProduct[productId] && purchasePriceByProduct[productId] > 0) {
        purchasePrice = purchasePriceByProduct[productId];
      }
      // Finally fall back to product data
      else if (product.purchasePrice && product.purchasePrice > 0) {
        purchasePrice = product.purchasePrice;
      }

      // Get selling price from stock calculation first, then product data
      let sellingPrice = 0;
      if (productStockValues.sellingPrice > 0) {
        sellingPrice = productStockValues.sellingPrice;
      } else {
        sellingPrice = product.sellingPrice > 0 ? product.sellingPrice : 0;
      }

      console.log(`Product ${product.productName}: Purchase Price = ${purchasePrice}, Selling Price = ${sellingPrice}`);

      // Always prefer stock calculation values for accuracy
      let currentStockValuePurchase, currentStockValueSale;
      if (productStockValues.quantity > 0) {
        // Use the values calculated in the closing stock function for consistency
        currentStockValuePurchase = parseFloat(productStockValues.purchaseValue.toFixed(2));
        currentStockValueSale = parseFloat(productStockValues.saleValue.toFixed(2));
      } else if (currentStock > 0) {
        // If we have stock but no stock values calculation, use the current values
        currentStockValuePurchase = parseFloat((currentStock * purchasePrice).toFixed(2));
        currentStockValueSale = parseFloat((currentStock * sellingPrice).toFixed(2));
      } else {
        // No stock
        currentStockValuePurchase = 0;
        currentStockValueSale = 0;
      }

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
            productId: product._id,
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
            productId: product._id,
            sku: product.sku || '',
            product: product.productName || 'Unknown Product',
            variation: '',
            imeiNo: '',
            serialNo: '',
            category: product.category ? product.category.name : '',
            location: isAllValue(locationId) ? 'All Locations' : 
                      (product.businessLocation ? product.businessLocation.name : ''),
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
    if (formattedStockItems.length === 0 && Object.keys(productFilters).length > 1) {
      console.log("No products found with current filters, trying with location filter only");

      // Create a new query with only the location filter
      const stockWithLocationFilter = await Stock.find({
        ...locationFilter,
        quantity: { $gt: 0 }
      }).distinct('product');

      console.log(`Found ${stockWithLocationFilter.length} products with stock in this location`);

      if (stockWithLocationFilter.length > 0) {
        // Get products that have stock in this location
        const productsWithStock = await Product.find({
          _id: { $in: stockWithLocationFilter },
          isDeleted: false
        })
        .populate('brand')
        .populate('category')
        .populate('businessLocation')
        .lean();

        console.log(`Retrieved ${productsWithStock.length} products with stock for report`);

        // Reset product IDs for filtering
        const newProductIds = productsWithStock.map(p => p._id);

        // Get stock for these products with the location filter
        const stockForProducts = await Stock.find({
          product: { $in: newProductIds },
          ...locationFilter,
          quantity: { $gt: 0 }
        }).populate('product').lean();

        console.log(`Found ${stockForProducts.length} stock entries for these products`);

        // Process stock items directly to create report items
        const productStockMap = {};
        stockForProducts.forEach(stock => {
          const productId = stock.product._id.toString();
          if (!productStockMap[productId]) {
            productStockMap[productId] = {
              product: stock.product,
              totalStock: 0,
              totalValue: 0,
              variants: []
            };
          }
          
          productStockMap[productId].totalStock += stock.quantity || 0;
          productStockMap[productId].totalValue += (stock.quantity || 0) * (stock.unitCost || 0);
          
          if (stock.imeiNo || stock.serialNo || stock.color || stock.storage) {
            productStockMap[productId].variants.push({
              quantity: stock.quantity || 0,
              unitCost: stock.unitCost || 0,
              imeiNo: stock.imeiNo,
              serialNo: stock.serialNo,
              color: stock.color,
              storage: stock.storage
            });
          }
        });

        // Create formatted stock items from the stock data
        for (const [productId, data] of Object.entries(productStockMap)) {
          const product = data.product;
          const currentStock = data.totalStock;
          const purchasePrice = data.totalStock > 0 ? (data.totalValue / data.totalStock) : 0;
          const sellingPrice = product.sellingPrice || 0;
          
          const currentStockValuePurchase = parseFloat((currentStock * purchasePrice).toFixed(2));
          const currentStockValueSale = parseFloat((currentStock * sellingPrice).toFixed(2));
          const potentialProfit = parseFloat((currentStockValueSale - currentStockValuePurchase).toFixed(2));

          let profitMargin = 0;
          if (currentStockValuePurchase > 0) {
            profitMargin = parseFloat(((potentialProfit / currentStockValuePurchase) * 100).toFixed(2));
          }

          // Get sales and returns data
          const totalSold = Number(soldQuantityByProduct[productId] || 0);
          const saleReturnsQty = Number(saleReturnsByProduct[productId] || 0);
          const purchaseReturnsQty = Number(purchaseReturnsByProduct[productId] || 0);
          const effectiveTotalSold = Math.max(0, totalSold - saleReturnsQty);

          // Add to totals
          totals.currentStock += currentStock;
          totals.currentStockValuePurchase += currentStockValuePurchase;
          totals.currentStockValueSale += currentStockValueSale;
          totals.potentialProfit += potentialProfit;
          totals.totalUnitSold += effectiveTotalSold;
          totals.totalUnitReturned += saleReturnsQty;
          totals.totalPurchaseReturned += purchaseReturnsQty;

          // If there are variants, add each as a separate item
          if (data.variants.length > 0) {
            for (const variant of data.variants) {
              const variantStock = variant.quantity || 0;
              if (variantStock <= 0) continue;
              
              const variantPurchasePrice = variant.unitCost || purchasePrice;
              const variantStockValuePurchase = parseFloat((variantStock * variantPurchasePrice).toFixed(2));
              const variantStockValueSale = parseFloat((variantStock * sellingPrice).toFixed(2));
              const variantPotentialProfit = parseFloat((variantStockValueSale - variantStockValuePurchase).toFixed(2));
              
              let variantProfitMargin = 0;
              if (variantStockValuePurchase > 0) {
                variantProfitMargin = parseFloat(((variantPotentialProfit / variantStockValuePurchase) * 100).toFixed(2));
              }

              formattedStockItems.push({
                productId: product._id,
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
            // Add as a single product
          formattedStockItems.push({
            productId: product._id,
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
    }

    // Calculate overall profit details for summary
    const overallPotentialProfit = parseFloat((closingStock.saleValue - closingStock.purchaseValue).toFixed(2));
    const overallProfitMargin = closingStock.purchaseValue > 0 ?
      parseFloat((((closingStock.saleValue - closingStock.purchaseValue) / closingStock.purchaseValue) * 100).toFixed(2)) : 0;

    console.log(`Overall profit margin: ${overallProfitMargin}%, Potential profit: ${overallPotentialProfit}`);
    console.log(`Total stock items to display: ${formattedStockItems.length}`);
    console.log(`Applied filters: Category=${categoryId || 'All'}, Brand=${brandId || 'All'}, Location=${locationId || 'All'}, Unit=${unit || 'All'}, Subcategory=${subcategoryId || 'All'}`);

    // Replace the calculated summary with accurate values from the direct calculation
    res.status(200).json({
      summary: {
        closingStockPurchasePrice: parseFloat(closingStock.purchaseValue.toFixed(2)),
        closingStockSalePrice: parseFloat(closingStock.saleValue.toFixed(2)),
        potentialProfit: overallPotentialProfit,
        profitMarginPercentage: overallProfitMargin
      },
      items: formattedStockItems,
      totals: {
        ...totals,
        currentStockValuePurchase: parseFloat(closingStock.purchaseValue.toFixed(2)),
        currentStockValueSale: parseFloat(closingStock.saleValue.toFixed(2)),
        potentialProfit: overallPotentialProfit,
        profitMargin: overallProfitMargin
      }
    });

  } catch (err) {
    console.error('Error fetching stock report:', err);
    res.status(500).json({ error: err.message });
  }
};
