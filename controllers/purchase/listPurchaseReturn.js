const mongoose = require('mongoose');
const Purchase = require('../../models/purchaseModel');

exports.listPurchaseReturns = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);
    const returns = await Purchase.find({ isDeleted: false, status: 'return', businessLocation: locationId })
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .populate('addedBy', 'name _id')
      .populate('products.product', 'productName')
      .populate('payments.account').populate('payments.method');

    res.status(200).json(returns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};