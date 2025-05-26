const Product = require('../../models/productModel');
const generateAutoId = require('../../utils/generateAutoId');

exports.addProduct = async (req, res) => {
  try {
    if (!req.body.sku) {
      req.body.sku = await generateAutoId('PROD');
    }
    const product = await Product.create(req.body);
    res.status(201).json({ message: 'Product created successfully', product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
