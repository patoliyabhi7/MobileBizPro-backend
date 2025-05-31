const mongoose = require('mongoose');
const Product = require('../../models/productModel');
const Stock = require('../../models/stockModel');

exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('brand')
      .populate('category')
      .populate('businessLocation')
      .lean();

    if (!product || product.isDeleted) return res.status(404).json({ message: 'Product not found' });

    const qty = await Stock.countDocuments({
      product: product._id,
      status: 1
    });

    res.status(200).json({ ...product, quantity: qty });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
