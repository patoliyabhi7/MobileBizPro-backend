const mongoose = require('mongoose');
const Purchase = require('../../models/purchaseModel');

exports.getPurchaseDuePayments = async (req, res) => {
  try {
    const locationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(locationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const duePurchases = await Purchase.find({
      paymentStatus: { $ne: 'paid' },
      paymentDue: { $gt: 0 },
      isDeleted: false,
      businessLocation: locationId
    })
      .populate('supplier', 'firstName lastName')
      .populate('payments.account', 'name')
      .populate('payments.method', 'name')
      .lean();

    const result = duePurchases.map(purchase => ({
      supplierName:
        (purchase.supplier?.firstName || '') +
        ' ' +
        (purchase.supplier?.lastName || '') || 'N/A',
      supplierId: purchase.supplier?._id || null,
      referenceNo: purchase.referenceNo,
      dueAmount: purchase.paymentDue,
      purchaseId: purchase._id,
      totalAmountWithGst: purchase.totalAmountWithGst || purchase.total || 0,
      payments: (purchase.payments || []).map(payment => ({
        account: payment.account?.name || '—',
        method: payment.method?.name || '—',
        amount: payment.amount || 0,
        paidOn: payment.paidOn || '',
        paymentRefNo: payment.paymentRefNo || '',
        bankAccountNo: payment.bankAccountNo || '',
        note: payment.note || '',
      }))
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
