const Sale = require('../../models/saleModel');

exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('payments.account')
      .populate('payments.method');

    if (!sale || sale.isDeleted) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Filter products to only include those that are NOT returned
    const filteredProducts = sale.products.filter(p => p.isReturn === false);

    if (filteredProducts.length === 0) {
      // All products returned - treat as not found or empty products
      return res.status(404).json({ message: 'No non-returned products found for this sale' });
    }

    // Override products with filtered list
    const saleObj = sale.toObject();
    saleObj.products = filteredProducts;

    res.status(200).json(saleObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
