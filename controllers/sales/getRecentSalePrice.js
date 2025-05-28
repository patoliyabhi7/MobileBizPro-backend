const Sale = require('../../models/saleModel');

exports.getRecentSalePrice = async (req, res) => {
  try {
    const { productId } = req.params;

    // Find the most recent sale that includes the product
    const latestSale = await Sale.findOne({ 'products.product': productId })
      .sort({ createdAt: -1 })
      .select('products')
      .lean(); // optional

    if (!latestSale) {
      return res.status(404).json({ message: 'No sale found for this product.' });
    }

    // Loop through all products in that sale to find the matching one
    const productEntry = latestSale.products.find(p =>
      p.product.toString() === productId // Fix: ensure type-safe string comparison
    );

    if (!productEntry) {
      return res.status(404).json({ message: 'Product not found in the most recent sale.' });
    }

    return res.status(200).json({
      salePrice: productEntry.unitPrice
    });
  } catch (err) {
    console.error('Error fetching recent sale price:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
