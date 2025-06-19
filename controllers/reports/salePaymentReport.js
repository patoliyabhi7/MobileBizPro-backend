const Sale = require('../../models/saleModel');
const Contact = require('../../models/contactModel');
const BusinessLocation = require('../../models/businessLocationModel');
const AccountType = require('../../models/accountTypeModel');
const mongoose = require('mongoose');

exports.getSalePaymentReport = async (req, res) => {
  try {
    const { startDate, endDate, customerId, locationId, paymentMethodId } = req.query;

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
    if (customerId && customerId !== 'All') {
      paymentFilter.customer = new mongoose.Types.ObjectId(customerId);
    }

    if (locationId && locationId !== 'All') {
      paymentFilter.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Fetch sales that have payments within the date range
    const sales = await Sale.find({ 
      ...paymentFilter,
      isDeleted: { $ne: true }
    })
    .populate('customer')
    .populate('businessLocation')
    .populate('payments.method')
    .lean();

    // Extract payment data from sales
    let payments = [];
    let totalAmount = 0;

    for (const sale of sales) {
      for (const payment of sale.payments || []) {
        // Apply payment method filter if specified
        if (paymentMethodId && paymentMethodId !== 'All' && 
            payment.method?._id.toString() !== paymentMethodId) {
          continue;
        }

        // Check if payment date is within range
        const paymentDate = new Date(payment.paidOn);
        if (paymentDate >= start && paymentDate <= end) {
          const paymentData = {
            id: payment._id,
            referenceNo: payment.paymentRefNo,
            paidOn: payment.paidOn,
            amount: payment.amount,
            customer: sale.customer ? {
              id: sale.customer._id,
              name: `${sale.customer.firstName || ''} ${sale.customer.lastName || ''}`.trim() || sale.customer.businessName || 'Unknown Customer'
            } : { name: 'Walk-in Customer' },
            location: sale.businessLocation?.name || 'Unknown Location',
            paymentMethod: payment.method?.name || 'Unknown Method',
            bankAccount: payment.bankAccountNo ? `(Bank Account No.: ${payment.bankAccountNo})` : '',
            sell: {
              id: sale._id,
              invoiceNo: sale.invoiceNo
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
        customerId: customerId || 'All',
        locationId: locationId || 'All',
        paymentMethodId: paymentMethodId || 'All'
      },
      totalAmount,
      payments
    });
  } catch (err) {
    console.error('Error fetching sale payment report:', err);
    res.status(500).json({ error: err.message });
  }
};
