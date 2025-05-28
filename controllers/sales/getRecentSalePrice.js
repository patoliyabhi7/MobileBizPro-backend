const Sale = require('../../models/saleModel'); 

exports.getRecentSalePrice = async (req, res) => {
  try {
    const { productId } = req.params;

    const latestSale = await Sale.findOne({ 'products._id': productId })
      .sort({ createdAt: -1 })
      .select('products')
      .lean();

    if (!latestSale) {
      return res.status(404).json({ message: 'No sale found for this product.' });
    }

    const productEntry = latestSale.products.find(p => p._id.toString() === productId);

    if (!productEntry) {
      return res.status(404).json({ message: 'Product not found in the most recent sale.' });
    }

    res.json({ salePrice: productEntry.total });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
