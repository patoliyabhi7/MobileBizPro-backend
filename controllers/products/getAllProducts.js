const Product = require('../../models/productModel');

exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find({ isDeleted: false })
      .populate('brand')
      .populate('category')
      .populate('businessLocation');
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
