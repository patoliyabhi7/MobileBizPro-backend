const Product = require('../../models/productModel');
const generateAutoId = require('../../utils/generateAutoId');

exports.addProduct = async (req, res) => {
  try {
    if (!req.body.sku) {
      req.body.sku = await generateAutoId('PROD');
    }
    const product = await Product.create(req.body);
    const newProduct = await Product.findById(product._id).populate('brand').populate('category').populate('businessLocation');
    res.status(201).json({ message: 'Product created successfully', newProduct });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
