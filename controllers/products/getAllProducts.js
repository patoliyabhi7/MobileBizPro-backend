const mongoose = require('mongoose');
const Product = require('../../models/productModel');
const Stock = require('../../models/stockModel');

exports.getAllProducts = async (req, res) => {
  try {
    // Get all products that are not deleted
    const products = await Product.find({ isDeleted: false })
      .populate('brand')
      .populate('category')
      .populate('businessLocation')
      .lean();

    // For each product, count stock items with status = 1
    const productsWithQty = await Promise.all(products.map(async (product) => {
      const qty = await Stock.countDocuments({
        product: product._id,
        status: 1
      });

      return {
        ...product,
        quantity: qty
      };
    }));

    res.status(200).json(productsWithQty);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
