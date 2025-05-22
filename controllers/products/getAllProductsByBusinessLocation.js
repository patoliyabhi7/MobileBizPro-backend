const mongoose = require('mongoose');
const Product = require('../../models/productModel');

exports.getAllProductsByBusinessLocation = async (req, res) => {
    try {
        const rawLocationId = req.params.locationId;

        if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
            return res.status(400).json({ error: 'Invalid Location ID format' });
        }

        const locationId = new mongoose.Types.ObjectId(rawLocationId);

        const products = await Product.find({
            businessLocation: locationId,
            isDeleted: false
        })
        .populate('brand')
        .populate('category')
        .populate('businessLocation');;

        res.status(200).json({ products });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
