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
      .populate('returnPayments.account')
      .populate('returnPayments.method')
      .lean();

    const formatted = returns.map(ret => ({
      _id: ret._id,
      date: ret.returnDate,
      referenceNo: ret.referenceNo,
      parentPurchase: ret.originalPurchase?.referenceNo || '—',
      location: ret.businessLocation?.name || '—',
      supplier: ret.originalPurchase?.supplier
        ? `${ret.originalPurchase.supplier.firstName} ${ret.originalPurchase.supplier.lastName}`
        : '—',
      paymentStatus: ret.paymentStatus,
      grandTotal: ret.totalReturnAmount,
      totalGstAmount: ret.totalGstAmount || 0,
      totalReturnAmountWithGst: ret.totalReturnAmountWithGst || 0,
      paymentDue: ret.paymentDue,
      payments: ret.returnPayments.map(payment => ({
        account: payment.account?.name || '—',
        method: payment.method?.name || '—',
        amount: payment.amount || 0,
        paidOn: payment.paidOn || '',
        paymentRefNo: payment.paymentRefNo || '',
        bankAccountNo: payment.bankAccountNo || '',
        note: payment.note || '',
      })),
      returnedProducts: ret.returnedProducts.map(prod => ({
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
