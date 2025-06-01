const mongoose = require('mongoose');
const Purchase = require('../../models/purchaseModel');

exports.listPurchaseReturns = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    const returns = await Purchase.find({
      isDeleted: false,
      status: 'return',
      businessLocation: locationId
    })
      .populate('supplier', 'businessName firstName lastName')
      .populate('businessLocation', 'name')
      .populate('addedBy', 'name _id')
      .populate('products.product', 'productName')
      .populate('payments.account')
      .populate('payments.method')
      .lean(); // ← to allow custom fields

    // Add top-level returnDate from first product
    const enriched = returns.map(entry => ({
      ...entry,
      returnDate: entry.products?.[0]?.returnDate || null
    }));

    res.status(200).json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
