const Purchase = require('../../models/purchaseModel');

exports.getRecentPurchasePrice = async (req, res) => {
  try {
    const { productId } = req.params;

    const latestPurchase = await Purchase.findOne({ 'products.product': productId })
      .sort({ createdAt: -1 })
      .select('products')
      .lean();

    if (!latestPurchase) {
      return res.status(404).json({ message: 'No purchase found for this product.' });
    }

    const productEntry = latestPurchase.products.find(p =>
      p.product.toString() === productId
    );

    if (!productEntry) {
      return res.status(404).json({ message: 'Product not found in the most recent purchase.' });
    }

    return res.status(200).json({
      purchasePrice: productEntry.unitCost
    });
  } catch (err) {
    console.error('Error fetching recent purchase price:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
