const Purchase = require('../../models/purchaseModel');
const Contact = require('../../models/contactModel');
const BusinessLocation = require('../../models/businessLocationModel');
const AccountType = require('../../models/accountTypeModel');
const mongoose = require('mongoose');

exports.getPurchasePaymentReport = async (req, res) => {
  try {
    const { startDate, endDate, supplierId, locationId } = req.query;

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Set to end of day

    // Build base payment filter - we're looking for payments made within the date range
    const paymentFilter = {
      'payments.paidOn': { $gte: start, $lte: end }
    };

    // Build additional filters
    if (supplierId && supplierId !== 'All') {
      paymentFilter.supplier = new mongoose.Types.ObjectId(supplierId);
    }

    if (locationId && locationId !== 'All') {
      paymentFilter.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Fetch purchases that have payments within the date range
    const purchases = await Purchase.find({ 
      ...paymentFilter,
      isDeleted: { $ne: true }
    })
    .populate('supplier')
    .populate('businessLocation')
    .populate('payments.method')
    .lean();

    // Extract payment data from purchases
    let payments = [];
    let totalAmount = 0;

    for (const purchase of purchases) {
      for (const payment of purchase.payments || []) {
        // Check if payment date is within range
        const paymentDate = new Date(payment.paidOn);
        if (paymentDate >= start && paymentDate <= end) {
          const paymentData = {
            id: payment._id,
            referenceNo: payment.paymentRefNo,
            paidOn: payment.paidOn,
            amount: payment.amount,
            supplier: purchase.supplier ? {
              id: purchase.supplier._id,
              name: purchase.supplier.businessName ? purchase.supplier.businessName + ' ' + `${purchase.supplier.firstName || ''} ${purchase.supplier.lastName || ''}`.trim() : `${purchase.supplier.firstName || ''} ${purchase.supplier.lastName || ''}`.trim() || 'Unknown Supplier'
            } : { name: 'Unknown Supplier' },
            location: purchase.businessLocation?.name || 'Unknown Location',
            paymentMethod: payment.method?.name || 'Unknown Method',
            bankAccount: payment.bankAccountNo ? `(Bank Account No.: ${payment.bankAccountNo})` : '',
            purchase: {
              id: purchase._id,
              referenceNo: purchase.referenceNo
            }
          };
          
          payments.push(paymentData);
          totalAmount += payment.amount;
        }
      }
    }

    // Sort payments by date (newest first)
    payments.sort((a, b) => new Date(b.paidOn) - new Date(a.paidOn));

    res.status(200).json({
      filters: {
        startDate,
        endDate,
        supplierId: supplierId || 'All',
        locationId: locationId || 'All'
      },
      totalAmount,
      payments
    });
  } catch (err) {
    console.error('Error fetching purchase payment report:', err);
    res.status(500).json({ error: err.message });
  }
};
