const Sale = require('../../models/saleModel');
const Product = require('../../models/productModel');
const Category = require('../../models/categoryModel');
const Brand = require('../../models/brandModel');
const BusinessLocation = require('../../models/businessLocationModel');
const mongoose = require('mongoose');

exports.getTrendingProductsReport = async (req, res) => {
  try {
    const {
      startDate, endDate,
      locationId, categoryId, subcategoryId, brandId,
      unitId, productTypeId, limit = 5
    } = req.query;

    // Parse and validate the limit
    const productLimit = parseInt(limit) || 5;
    if (productLimit <= 0 || productLimit > 50) {
      return res.status(400).json({ 
        error: 'Number of products must be between 1 and 50' 
      });
    }

    // Build date filter
    let dateFilter = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Set to end of day
      dateFilter = { saleDate: { $gte: start, $lte: end } };
    }

    // Build pipeline to aggregate sales data by product
    let pipeline = [
      {
        $match: {
          ...dateFilter,
          isDeleted: { $ne: true }
        }
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'products',
          localField: 'products.product',
          foreignField: '_id',
          as: 'productDetails'
        }
      },
      { $unwind: '$productDetails' }
    ];

    // Apply location filter if provided
    if (locationId && locationId !== 'All') {
      pipeline[0].$match.businessLocation =  new mongoose.Types.ObjectId(locationId);
    }

    // Apply additional filters on the product details
    let productFilters = {};

    if (categoryId && categoryId !== 'All') {
      productFilters['productDetails.category'] = new mongoose.Types.ObjectId(categoryId);
    }

    if (subcategoryId && subcategoryId !== 'All') {
      productFilters['productDetails.subCategory'] = new mongoose.Types.ObjectId(subcategoryId);
    }

    if (brandId && brandId !== 'All') {
      productFilters['productDetails.brand'] = new mongoose.Types.ObjectId(brandId);
    }

    if (unitId && unitId !== 'All') {
      productFilters['productDetails.unit'] = unitId;
    }

    if (productTypeId && productTypeId !== 'All') {
      productFilters['productDetails.type'] = productTypeId;
    }

    // Add product filters to pipeline if any exist
    if (Object.keys(productFilters).length > 0) {
      pipeline.push({ $match: productFilters });
    }

    // Group by product and calculate total units sold
    pipeline.push(
      {
        $group: {
          _id: '$products.product',
          productName: { $first: '$productDetails.productName' },
          sku: { $first: '$productDetails.sku' },
          brandName: { $first: '$productDetails.brand' },
          categoryName: { $first: '$productDetails.category' },
          unitsSold: { $sum: '$products.quantity' }
        }
      },
      {
        $sort: { unitsSold: -1 }
      },
      {
        $limit: productLimit
      },
      {
        $lookup: {
          from: 'brands',
          localField: 'brandName',
          foreignField: '_id',
          as: 'brandDetail'
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryName',
          foreignField: '_id',
          as: 'categoryDetail'
        }
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          sku: 1,
          unitsSold: 1,
          brandName: { $arrayElemAt: ['$brandDetail.name', 0] },
          categoryName: { $arrayElemAt: ['$categoryDetail.name', 0] }
        }
      }
    );

    // Execute the aggregation
    const trendingProducts = await Sale.aggregate(pipeline);

    // Format data for the chart
    const chartData = trendingProducts.map(product => ({
      name: `${product.productName} - ${product.sku}`,
      totalUnitSold: product.unitsSold
    }));

    // Return the result
    res.status(200).json({
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        locationId: locationId || 'All',
        categoryId: categoryId || 'All',
        subcategoryId: subcategoryId || 'All',
        brandId: brandId || 'All',
        unitId: unitId || 'All',
        productTypeId: productTypeId || 'All',
        limit: productLimit
      },
      trendingProducts,
      chartData
    });
  } catch (err) {
    console.error('Error generating trending products report:', err);
    res.status(500).json({ error: err.message });
  }
};

