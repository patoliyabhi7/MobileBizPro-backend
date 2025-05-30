const mongoose = require('mongoose');
const Product = require('../../models/productModel');
const Stock = require('../../models/stockModel');

exports.getAllProductsByBusinessLocation = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    // Find products by business location and not deleted
    const products = await Product.find({
      businessLocation: locationId,
      isDeleted: false
    })
    .populate('brand')
    .populate('category')
    .populate('businessLocation')
    .lean();

    // For each product, count stock items in this location with status = 1
    const productsWithQty = await Promise.all(products.map(async (product) => {
      const qty = await Stock.countDocuments({
        product: product._id,
        businessLocation: locationId,
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
