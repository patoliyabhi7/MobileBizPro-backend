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
      .populate('customer', 'firstName lastName businessName')
      .populate('businessLocation', 'name')
      .populate('addedBy', 'name _id')
      .populate({
        path: 'products.product',
        select: 'productName'
      })
      .populate({
        path: 'payments.method',
        select: 'name'
      })
      .populate({
        path: 'payments.account',
        select: 'name'
      })
      .lean();

    // Fetch sale returns data using returnDate field
    const saleReturns = await SaleReturn.find({
      ...addCommonFilters({}),
      returnDate: dateRange
    })
      .sort({ returnDate: -1 })
      .populate({
        path: 'originalSale',
        select: 'invoiceNo customer',
        populate: {
          path: 'customer',
          select: 'firstName lastName businessName'
        }
      })
      .populate('businessLocation', 'name')
      .populate('addedBy', 'name _id')
      .populate({
        path: 'returnedProducts.product',
        select: 'productName'
      })
      .populate({
        path: 'returnPayments.method',
        select: 'name'
      })
      .populate({
        path: 'returnPayments.account',
        select: 'name'
      })
      .populate('newPurchase', 'referenceNo paymentDue paymentStatus total payments')
      .lean();

    // Fetch expenses data using transactionDate field
    const expenses = await Expense.find({
      ...addCommonFilters({}),
      transactionDate: dateRange
    })
      .sort({ transactionDate: -1 })
      .populate('category', 'name')
      .populate('businessLocation', 'name')
      .populate('addedBy', 'name _id')
      .populate('expenseFor', 'name')
      .populate('expenseForContact', 'firstName lastName businessName')
      .populate({
        path: 'payments.method',
        select: 'name'
      })
      .populate({
        path: 'payments.account',
        select: 'name'
      })
      .lean();

    // Calculate summary stats
    const totalSaleAmount = sales.reduce((acc, sale) => acc + (sale.total || 0), 0);
    const totalSaleReturnAmount = saleReturns.reduce((acc, saleReturn) => acc + (saleReturn.totalReturnAmount || 0), 0);
    const totalSaleNet = totalSaleAmount - totalSaleReturnAmount;
    const totalExpenseAmount = expenses.reduce((acc, expense) => acc + (expense.totalAmount || 0), 0);

    // Format combined sales and returns data for response
    const formattedTransactions = [];
    
    // Add sales entries
    sales.forEach(sale => {
      // Use the payment status directly from the database
      const paymentStatus = sale.paymentStatus || 'Due';
      const totalPaid = sale.payments?.reduce((acc, payment) => acc + payment.amount, 0) || 0;
      const remaining = sale.total - totalPaid;

      // Get product details (for showing in the invoice details)
      const productDetails = sale.products?.[0] ? {
        imeiNo: sale.products[0].imeiNo,
        productName: sale.products[0].product?.productName || 'Unknown Product'
      } : null;

      formattedTransactions.push({
        _id: sale._id,
        date: sale.saleDate,
        type: 'sale',
        invoiceNo: sale.invoiceNo,
        referenceNo: sale.invoiceNo, // For consistent field naming
        customerName: sale.customer ? `${sale.customer.firstName || ''} ${sale.customer.lastName || ''}`.trim() || sale.customer.businessName || 'Walk-in Customer' : 'Walk-in Customer',
        location: sale.businessLocation?.name || 'Unknown Location',
        paymentStatus,
        totalAmount: sale.total || 0,
        totalPaid,
        totalRemaining: remaining,
        productDetails,
        section: 'sales' // Mark as part of sales section
      });
    });

    // Add sale return entries
    saleReturns.forEach(saleReturn => {
      // Get product details from the first returned product
      const productDetails = saleReturn.returnedProducts?.[0] ? {
        imeiNo: saleReturn.returnedProducts[0].imeiNo,
        productName: saleReturn.returnedProducts[0].product?.productName || 'Unknown Product'
      } : null;

      formattedTransactions.push({
        _id: saleReturn._id,
        date: saleReturn.returnDate,
        type: 'return',
        invoiceNo: saleReturn.originalSale?.invoiceNo || 'N/A',
        referenceNo: saleReturn.referenceNo,
        customerName: saleReturn.originalSale?.customer ? 
          `${saleReturn.originalSale.customer.firstName || ''} ${saleReturn.originalSale.customer.lastName || ''}`.trim() || 
          saleReturn.originalSale.customer.businessName || 'Walk-in Customer' : 
          'Walk-in Customer',
        location: saleReturn.businessLocation?.name || 'Unknown Location',
        paymentStatus: saleReturn.newPurchase?.paymentStatus || 'Returned',
        totalAmount: -1 * (saleReturn.newPurchase?.total || 0), // Keep negative to indicate return
        totalPaid: saleReturn.newPurchase?.payments?.reduce((acc, payment) => acc + payment.amount, 0) || 0,
        totalRemaining: saleReturn.newPurchase?.paymentDue || 0,
        productDetails, // Added product details
        isReturn: true,
        section: 'sales' // Mark as part of sales section
      });
    });

    // Format expenses data for response
    const formattedExpenses = expenses.map(expense => {
      // Determine payment status
      const paymentStatus = expense.paymentStatus || 'Paid';

      // Safely handle expense contact information
      let expenseForName = '';
      if (expense.expenseFor && expense.expenseFor.name) {
        expenseForName = expense.expenseFor.name;
      } else if (expense.expenseForContact) {
        expenseForName = 
          `${expense.expenseForContact.firstName || ''} ${expense.expenseForContact.lastName || ''}`.trim() || 
          expense.expenseForContact.businessName || '';
      }

      return {
        _id: expense._id,
        date: expense.transactionDate,
        type: 'expense',
        referenceNo: expense.referenceNo,
        expenseCategory: expense.category?.name || 'Uncategorized',
        location: expense.businessLocation?.name || 'Unknown Location',
        paymentStatus,
        totalAmount: expense.totalAmount || 0,
        expenseFor: expenseForName,
        expenseNote: expense.additionalNotes || '',
        section: 'expenses' // Mark as part of expenses section
      };
    });

    // Add expenses to the main transactions array
    formattedTransactions.push(...formattedExpenses);

    // Group transactions by section
    const salesTransactions = formattedTransactions.filter(t => t.section === 'sales');
    const expenseTransactions = formattedTransactions.filter(t => t.section === 'expenses');

    // Sort all entries in each section by date, newest first
    salesTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    expenseTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Count payment statuses for sales
    const salePaymentStatusCounts = {
      paid: salesTransactions.filter(sale => sale.type === 'sale' && sale.paymentStatus === 'Paid').length,
      partial: salesTransactions.filter(sale => sale.type === 'sale' && sale.paymentStatus === 'Partial').length,
      due: salesTransactions.filter(sale => sale.type === 'sale' && sale.paymentStatus === 'Due').length,
      returned: salesTransactions.filter(sale => sale.type === 'return').length
    };

    // Calculate total paid and due amounts for sales
    const salesOnlyTransactions = salesTransactions.filter(t => t.type === 'sale');
    const totalPaidAmount = salesOnlyTransactions.reduce((acc, sale) => acc + (sale.totalPaid || 0), 0);
    const totalDueAmount = salesOnlyTransactions.reduce((acc, sale) => acc + (sale.totalRemaining || 0), 0);

    // Calculate expense payment status counts
    const expensePaymentStatusCounts = {
      paid: expenseTransactions.filter(exp => exp.paymentStatus === 'Paid').length,
      partial: expenseTransactions.filter(exp => exp.paymentStatus === 'Partial').length,
      due: expenseTransactions.filter(exp => exp.paymentStatus === 'Due').length,
    };

    res.json({
      summary: {
        totalSaleAmount,
        totalSaleReturnAmount,
        totalSaleNet,
        totalExpenseAmount
      },
      sales: {
        data: salesTransactions,
        counts: {
          total: salesTransactions.length,
          sales: salesOnlyTransactions.length,
          returns: salesTransactions.filter(t => t.type === 'return').length,
          ...salePaymentStatusCounts
        },
        totals: {
          amount: totalSaleAmount,
          returnAmount: totalSaleReturnAmount,
          netAmount: totalSaleNet,
          paid: totalPaidAmount,
          due: totalDueAmount
        }
      },
      expenses: {
        data: expenseTransactions,
        counts: {
          total: expenseTransactions.length,
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


