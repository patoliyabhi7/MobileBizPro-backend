const mongoose = require('mongoose');
const SaleReturn = require('../../models/saleReturnModel');

exports.listSaleReturns = async (req, res) => {
  try {
    const rawLocationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const locationId = new mongoose.Types.ObjectId(rawLocationId);

    const saleReturns = await SaleReturn.find({ businessLocation: locationId, isDeleted: false })
      .populate({
        path: 'originalSale',
        select: 'invoiceNo customer',
        populate: { path: 'customer', select: 'firstName lastName' }
      })
      .populate('newPurchase', 'referenceNo paymentDue paymentStatus')
      .populate('businessLocation', 'name')
      .populate('addedBy', 'name')
      .populate('returnedProducts.product', 'productName')
      .populate('returnPayments.account', 'name')
      .populate('returnPayments.method', 'name')
      .lean();

    const formatted = saleReturns.map(sr => ({
      _id: sr._id,
      date: sr.returnDate,
      invoiceNo: sr.referenceNo,
      parentSale: sr.originalSale?.invoiceNo || '—',
      customerName: sr.originalSale?.customer
        ? `${sr.originalSale.customer.firstName} ${sr.originalSale.customer.lastName}`
        : '—',
      location: sr.businessLocation?.name || '—',
      paymentStatus: sr.newPurchase?.paymentStatus,
      totalAmount: sr.totalReturnAmount,
      totalAmountWithGst: sr.totalReturnAmountWithGst,
      paymentDue: sr.newPurchase?.paymentDue,
      returnedProducts: (sr.returnedProducts || []).map(prod => ({
        productName: prod.product?.productName || '—',
        serialNo: prod.serialNo || '',
        imeiNo: prod.imeiNo || '',
        color: prod.color || '',
        storage: prod.storage || '',
        quantity: prod.quantity || 0,
        unitCost: prod.unitCost || 0,
        lineTotal: prod.lineTotal || 0,
        gstApplicable: prod.gstApplicable || false,
        gstPercentage: prod.gstPercentage || 0,
        gstAmount: prod.gstAmount || 0,
        lineTotalWithGst: prod.lineTotalWithGst || 0,
        note: prod.note || '',
      }))
    }));

    res.status(200).json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
