const Product = require('../../models/productModel');

exports.deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );
    if (!deleted) return res.status(404).json({ message: 'Product not found' });
    res.status(200).json({ message: 'Product soft-deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
