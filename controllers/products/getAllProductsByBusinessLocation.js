const mongoose = require('mongoose');
const Product = require('../../models/productModel');
const Stock = require('../../models/stockModel');
const Purchase = require('../../models/purchaseModel');

exports.getAllProductsByBusinessLocation = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    // Find all products for this location
    const products = await Product.find({
      businessLocation: locationId,
      isDeleted: false
    })
      .populate('brand')
      .populate('category')
      .populate('businessLocation')
      .lean();

    const productIds = products.map(p => p._id);

    // Fetch recent purchase price for each product in one shot
    const recentPurchases = await Purchase.aggregate([
      { $match: { 'products.product': { $in: productIds } } },
      { $unwind: '$products' },
      { $match: { 'products.product': { $in: productIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$products.product',
          purchasePrice: { $first: '$products.unitCost' }
        }
      }
    ]);

    // Map of productId -> recent purchasePrice
    const priceMap = new Map();
    recentPurchases.forEach(p => {
      priceMap.set(p._id.toString(), p.purchasePrice);
    });

    // Fetch stock quantity for each product
    const productsWithQty = await Promise.all(products.map(async (product) => {
      const stocks = await Stock.find({
        product: product._id,
        businessLocation: locationId,
        status: 1
      });
      
      const qty = stocks.reduce((total, stock) => total + (stock.quantity || 0), 0);

      return {
        ...product,
        quantity: qty,
        recentPurchasePrice: priceMap.get(product._id.toString()) || 0
      };
    }));

    res.status(200).json(productsWithQty);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
