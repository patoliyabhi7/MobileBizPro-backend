const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');

exports.getAllSalesByBusinessLocation = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    const sales = await Sale.find({
      businessLocation: locationId,
      isDeleted: false
    })
      .populate('customer')
      .populate('businessLocation')
      .populate('products.product')
      .populate('addedBy', 'name _id')
      .populate('products.stockId', 'quantity imeiNo serialNo status')
      .populate('payments.account')
      .populate('payments.method');

    res.status(200).json({ sales });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
