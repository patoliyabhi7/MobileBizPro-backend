const mongoose = require('mongoose');
const Product = require('../../models/productModel');
const Stock = require('../../models/stockModel');
const Purchase = require('../../models/purchaseModel');

exports.getPurchasedProducts = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    // Get all available stock at this location
    const stocks = await Stock.find({
      businessLocation: locationId,
      status: 1
    }).populate({
      path: 'product',
      populate: ['brand', 'category']
    }).lean();

    const result = [];

    // Get unique product IDs from stock
    const productIds = [...new Set(stocks.map(s => s.product?._id?.toString()).filter(Boolean))];

    // Fetch latest purchase price per product using aggregation
    const recentPurchases = await Purchase.aggregate([
      { $match: { 'products.product': { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) } } },
      { $unwind: '$products' },
      { $match: { 'products.product': { $in: productIds.map(id => new mongoose.Types.ObjectId(id)) } } },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$products.product',
          purchasePrice: { $first: '$products.unitCost' }
        }
      }
    ]);

    const priceMap = new Map();
    recentPurchases.forEach(p => {
      priceMap.set(p._id.toString(), p.purchasePrice.toString());
    });

    for (const stock of stocks) {
      const product = stock.product;
      if (!product || product.isDeleted) continue;

      const purchasePrice = priceMap.get(product._id.toString()) || '0';

      result.push({
        purchase_line_id: stock.purchaseRef || null,
        product_id: product._id,
        name: product.productName,
        sub_sku: product.sku,
        type: product.type || 'single',
        unit: product.unit,
        category_id: product.category?._id || null,
        enable_stock: 1,
        serial_no: stock.serialNo || null,
        imei_no: stock.imeiNo || null,
        color: stock.color || null,
        storage: stock.storage || null,
        variation: stock.variation || 'DUMMY',
        variation_id: stock.variation_id || 0,
        selling_price: purchasePrice,
        qty_available: stock.quantity,
        availabel_to_sell: stock.quantity,
        brand_name: product.brand?.name || null,
        stock_id: stock._id,
      });
    }

    res.status(200).json(result);
  } catch (err) {
    console.error('Error fetching purchased products:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
