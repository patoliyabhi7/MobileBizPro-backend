const Product = require('../../models/productModel');
const Purchase = require('../../models/purchaseModel');
const Sale = require('../../models/saleModel');

exports.getPurchasedProducts = async (req, res) => {
  try {
    const purchases = await Purchase.find({
      isDeleted: false,
      status: { $ne: 'return' }
    }).lean();

    const sales = await Sale.find({
      isDeleted: false,
      status: { $ne: 'return' }
    }).lean();

    const soldMap = {};

    // calculate sold qty for each product
    for (const sale of sales) {
      for (const item of sale.products || []) {
        const id = item.product?.toString();
        if (!soldMap[id]) soldMap[id] = 0;
        soldMap[id] += item.quantity;
      }
    }

    const result = [];

    for (const purchase of purchases) {
      for (const line of purchase.products || []) {
        const product = await Product.findById(line.product).lean();
        if (!product) continue;

        const totalQty = line.quantity || 0;
        const soldQty = soldMap[product._id.toString()] || 0;
        const qtyAvailable = totalQty - soldQty;

        if (qtyAvailable <= 0) continue;

        result.push({
          purchase_line_id: line._id,
          product_id: product._id,
          name: product.productName,
          sub_sku: product.sku,
          type: product.type || 'single',
          unit: product.unit,
          category_id: product.category,
          enable_stock: product.quantity > 0 ? 1 : 0,
          serial_no: line.serialNo || null,
          imei_no: line.imeiNo || null,
          color: line.color || null,
          storage: line.storage || null,
          variation: line.variation || 'DUMMY',
          variation_id: line.variation_id || 0,
          selling_price: product.sellingPrice?.toString() || '0',
          qty_available: qtyAvailable,
          availabel_to_sell: qtyAvailable.toFixed(4)
        });
      }
    }

    res.status(200).json(result);
  } catch (err) {
    console.error('Error fetching purchased products:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
