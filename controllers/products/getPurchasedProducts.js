const Product = require('../../models/productModel');
const Stock = require('../../models/stockModel');

exports.getPurchasedProducts = async (req, res) => {
  try {
    const { businessLocation } = req.params;

    if (!businessLocation) {
      return res.status(400).json({ error: 'businessLocation is required' });
    }

    // Get available (not sold) stock at this location
    const stocks = await Stock.find({
      businessLocation,
      status: 1 // Only in-stock items
    }).populate({
      path: 'product',
      populate: ['brand', 'category']
    }).lean();    

    const result = [];

    for (const stock of stocks) {
      const product = stock.product;
      if (!product || product.isDeleted) continue;

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
        selling_price: stock.purchaseRef?.purchasePrice?.toString() || '0',
        qty_available: 1,
        availabel_to_sell: '1.0000',
        brand_name: product.brand?.name || null,
      });
    }

    res.status(200).json(result);
  } catch (err) {
    console.error('Error fetching purchased products:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
