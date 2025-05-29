const Product = require('../models/productModel');

// operation = 'increase' | 'decrease'
const updateStock = async (products = [], operation = 'increase') => {
  for (const item of products) {
    const productId = item.product;
    const qty = item.quantity || 0;

    const product = await Product.findById(productId);
    if (!product) continue;

    if (operation === 'increase') {
      product.quantity += qty;
    } else if (operation === 'decrease') {
      product.quantity -= qty;
      if (product.quantity < 0) product.quantity = 0;
    }

    await product.save();
  }
};

module.exports = updateStock;
