const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');

exports.listSaleReturns = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    const saleReturns = await Sale.find({
      isDeleted: false,
      status: 'return',
      businessLocation: locationId
    })
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('payments.account')
      .populate('payments.method')
      .lean(); // ← enable object modification

    const enriched = saleReturns.map(entry => ({
      ...entry,
      returnDate: entry.products?.[0]?.returnDate || null
    }));

    res.status(200).json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
