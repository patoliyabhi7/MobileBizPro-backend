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
      .populate({
        path: 'originalSale',
        select: 'invoiceNo customer',
        populate: { path: 'customer', select: 'firstName lastName' }
      })
      .populate('businessLocation', 'name')
      .populate('addedBy', 'name')
      .populate('returnedProducts.product', 'productName')
      .populate('returnPayments.account', 'name')
      .populate('returnPayments.method', 'name')
      .lean();

    const formatted = saleReturns.map(sr => ({
      date: sr.returnDate,
      invoiceNo: sr.referenceNo,
      parentSale: sr.originalSale?.invoiceNo || '—',
      customerName: sr.originalSale?.customer?.firstName + ' ' + sr.originalSale?.customer?.lastName || '—',
      location: sr.businessLocation?.name || '—',
      paymentStatus: sr.paymentStatus || 'due',
      totalAmount: sr.totalReturnAmount,
      paymentDue: sr.paymentDue || sr.totalReturnAmount
    }));

    res.status(200).json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

