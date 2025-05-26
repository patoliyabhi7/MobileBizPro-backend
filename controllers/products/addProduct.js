const Product = require('../../models/productModel');

exports.addProduct = async (req, res) => {
  try {
    if (!req.body.sku) {
        const lastProduct = await Product.findOne().sort({ _id: -1 });
        const newSkuNumber = lastProduct ? parseInt(lastProduct.sku.replace('PROD', '')) + 1 : 1;
        req.body.sku = `PROD${newSkuNumber.toString().padStart(4, '0')}`;
    }
    const product = await Product.create(req.body);
    res.status(201).json({ message: 'Product created successfully', product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
