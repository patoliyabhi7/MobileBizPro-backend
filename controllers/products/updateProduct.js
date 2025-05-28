const Product = require('../../models/productModel');

exports.updateProduct = async (req, res) => {
  try {
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Product not found' });
    const updatedProduct = await Product.findById(updated._id).populate('brand').populate('category').populate('businessLocation');
    res.status(200).json({ message: 'Product updated', updatedProduct });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
