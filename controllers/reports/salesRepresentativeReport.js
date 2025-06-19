const Sale = require('../../models/saleModel');
const SaleReturn = require('../../models/saleReturnModel');
const Expense = require('../../models/expenseModel');
const User = require('../../models/userModel');
const mongoose = require('mongoose');
const BusinessLocation = require('../../models/businessLocationModel');

exports.getSalesRepresentativeReport = async (req, res) => {
  try {
    const { startDate, endDate, userId, locationId } = req.query;

    // Validate required parameters
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Parse dates and set time ranges
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Set to end of day

    // Build filters
    const userFilter = userId && userId !== 'All Users' ? { addedBy: new mongoose.Types.ObjectId(userId) } : {};
    const locationFilter = locationId && locationId !== 'All locations' ? { businessLocation: new mongoose.Types.ObjectId(locationId) } : {};
    const dateRange = { $gte: start, $lte: end };

    // Helper function to add common filters (isDeleted, userFilter, locationFilter)
    const addCommonFilters = (query) => ({
      ...query,
      ...userFilter,
      ...locationFilter,
      isDeleted: { $ne: true }
    });
    
    // Fetch sales data using saleDate field
    const sales = await Sale.find({
      ...addCommonFilters({}),
      saleDate: dateRange
    })
      .sort({ saleDate: -1 })
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product');

    // Fetch sale returns data using returnDate field
    const saleReturns = await SaleReturn.find({
      ...addCommonFilters({}),
      returnDate: dateRange
    })
      .sort({ returnDate: -1 })
      .populate('originalSale')
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id');

    // Fetch expenses data using transactionDate field
    const expenses = await Expense.find({
      ...addCommonFilters({}),
      transactionDate: dateRange
    })
      .sort({ transactionDate: -1 })
      .populate('expenseCategory')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('paidFrom');

    // Calculate summary stats
    const totalSaleAmount = sales.reduce((acc, sale) => acc + (sale.total || 0), 0);
    const totalSaleReturnAmount = saleReturns.reduce((acc, saleReturn) => acc + (saleReturn.totalReturnAmount || 0), 0);
    const totalSaleNet = totalSaleAmount - totalSaleReturnAmount;
    const totalExpenseAmount = expenses.reduce((acc, expense) => acc + (expense.amount || 0), 0);

    // Format sales data for response
    const formattedSales = sales.map(sale => {
      // Calculate payment status
      let paymentStatus = 'Due';
      const totalPaid = sale.payments?.reduce((acc, payment) => acc + payment.amount, 0) || 0;
      const remaining = sale.total - totalPaid;

      if (totalPaid >= sale.total) {
        paymentStatus = 'Paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'Partial';
      }

      // Get product details (for showing in the invoice details)
      const productDetails = sale.products?.[0] ? {
        imeiNo: sale.products[0].imeiNo,
        productName: sale.products[0].product?.productName || 'Unknown Product'
      } : null;

      return {
        _id: sale._id,
        date: sale.saleDate,
        invoiceNo: sale.invoiceNo,
        customerName: sale.customer ? `${sale.customer.firstName || ''} ${sale.customer.lastName || ''}`.trim() : 'Walk-in Customer',
        location: sale.businessLocation?.name || 'Unknown Location',
        paymentStatus,
        totalAmount: sale.total || 0,
        totalPaid,
        totalRemaining: remaining,
        productDetails
      };
    });

    // Format expenses data for response
    const formattedExpenses = expenses.map(expense => {
      // Determine payment status
      const paymentStatus = expense.paymentStatus || 'Paid';

      return {
        _id: expense._id,
        date: expense.transactionDate,
        referenceNo: expense.referenceNo,
        expenseCategory: expense.expenseCategory?.name || 'Uncategorized',
        location: expense.businessLocation?.name || 'Unknown Location',
        paymentStatus,
        totalAmount: expense.amount || 0,
        expenseFor: expense.expenseFor || '',
        expenseNote: expense.notes || ''
      };
    });

    // Count payment statuses
    const paymentStatusCounts = {
      paid: formattedSales.filter(sale => sale.paymentStatus === 'Paid').length,
      partial: formattedSales.filter(sale => sale.paymentStatus === 'Partial').length,
      due: formattedSales.filter(sale => sale.paymentStatus === 'Due').length,
    };

    // Calculate total paid and due amounts
    const totalPaidAmount = formattedSales.reduce((acc, sale) => acc + sale.totalPaid, 0);
    const totalDueAmount = formattedSales.reduce((acc, sale) => acc + sale.totalRemaining, 0);

    // Calculate expense payment status counts
    const expensePaymentStatusCounts = {
      paid: formattedExpenses.filter(exp => exp.paymentStatus === 'Paid').length,
      partial: formattedExpenses.filter(exp => exp.paymentStatus === 'Partial').length,
    };

    res.json({
      summary: {
        totalSaleAmount,
        totalSaleReturnAmount,
        totalSaleNet,
        totalExpenseAmount
      },
      sales: {
        data: formattedSales,
        counts: {
          total: formattedSales.length,
          ...paymentStatusCounts
        },
        totals: {
          amount: totalSaleAmount,
          paid: totalPaidAmount,
          due: totalDueAmount,
          saleReturnDue: 0 // Add actual calculation if available
        }
      },
      expenses: {
        data: formattedExpenses,
        counts: {
          total: formattedExpenses.length,
          ...expensePaymentStatusCounts
        },
        total: totalExpenseAmount
      }
    });

  } catch (error) {
    console.error('Error in sales representative report:', error);
    res.status(500).json({ error: error.message });
  }
};


