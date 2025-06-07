const mongoose = require('mongoose');
const SaleReturn = require('../../models/saleReturnModel');

exports.listSaleReturns = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    const saleReturns = await SaleReturn.find({ businessLocation: locationId })
      .populate('originalSale', 'invoiceNo customer')
      .populate('businessLocation', 'name')
      .populate('addedBy', 'name _id')
      .populate('returnedProducts.product', 'productName')
      .populate('returnPayments.account', 'name')
      .populate('returnPayments.method', 'name')
      .lean();

    res.status(200).json(saleReturns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
