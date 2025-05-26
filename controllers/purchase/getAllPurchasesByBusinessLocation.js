const mongoose = require('mongoose');
const Purchase = require('../../models/purchaseModel');

exports.getAllPurchasesByBusinessLocation = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    const purchases = await Purchase.find({
      businessLocation: locationId,
      isDeleted: false
    })
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .populate('products.product', 'productName')
      .populate('addedBy', 'name _id')
      .populate('linkedAccount');

    res.status(200).json({ purchases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


