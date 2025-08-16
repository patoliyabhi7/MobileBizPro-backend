const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');

exports.getSaleDuePayments = async (req, res) => {
  try {
    const locationId = req.params.locationId;

    if (!mongoose.Types.ObjectId.isValid(locationId)) {
      return res.status(400).json({ error: 'Invalid Location ID format' });
    }

    const dueSales = await Sale.find({
      paymentStatus: { $ne: 'paid' },
      paymentDue: { $gt: 0 },
      isDeleted: false,
      businessLocation: locationId
    })
      .populate('customer', 'firstName lastName')
      .populate('payments.account', 'name')
      .populate('payments.method', 'name')
      .lean();

    const result = dueSales.map(sale => ({
      customerName:
        (sale.customer?.firstName || '') +
        ' ' +
        (sale.customer?.lastName || '') || 'N/A',
      customerId: sale.customer?._id || null,
      invoiceNo: sale.invoiceNo,
      dueAmount: sale.paymentDue,
      saleId: sale._id,
      totalAmountWithGst: sale.totalAmountWithGst || sale.total || 0,
      payments: (sale.payments || []).map(payment => ({
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