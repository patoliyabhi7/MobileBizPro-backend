const mongoose = require('mongoose');
const PurchaseReturn = require('../../models/purchaseReturnModel');

exports.listPurchaseReturns = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    const returns = await PurchaseReturn.find({ businessLocation: locationId })
      .populate({
        path: 'originalPurchase',
        select: 'referenceNo supplier',
        populate: { path: 'supplier', select: 'firstName lastName' }
      })
      .populate('businessLocation', 'name')
      .populate('addedBy', 'name')
      .populate('returnedProducts.product', 'productName')
      .populate('returnPayments.account', 'name')
      .populate('returnPayments.method', 'name')
      .lean();

    const formatted = returns.map(ret => ({
      _id: ret._id,
      date: ret.returnDate,
      referenceNo: ret.referenceNo,
      parentPurchase: ret.originalPurchase?.referenceNo || '—',
      location: ret.businessLocation?.name || '—',
      supplier: ret.originalPurchase?.supplier?.firstName + ' ' + ret.originalPurchase?.supplier?.lastName || '—',
      paymentStatus: ret.paymentStatus || 'due',
      grandTotal: ret.totalReturnAmount,
      paymentDue: ret.paymentDue || ret.totalReturnAmount
    }));

    res.status(200).json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

