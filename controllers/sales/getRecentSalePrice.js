const Sale = require('../../models/saleModel');

exports.getRecentSalePrice = async (req, res) => {
  try {
    const { productId } = req.params;

    const latestSale = await Sale.findOne({ 'products.product': productId })
      .sort({ createdAt: -1 })
      .select('products')
      .lean();

    if (!latestSale) {
      return res.status(404).json({ message: 'No sale found for this product.' });
    }

    const productEntry = latestSale.products.find(p =>
      p.product.toString() === productId
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
