const Expense = require('../../models/expenseModel');
const BusinessLocation = require('../../models/businessLocationModel');
const ExpenseCategory = require('../../models/expenseCategoryModel');
const mongoose = require('mongoose');

exports.getExpenseReport = async (req, res) => {
  try {
    const { startDate, endDate, locationId, categoryId } = req.query;

    // Build filters
    const filters = { isDeleted: { $ne: true } };

    // Date range filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Set to end of day
      filters.transactionDate = { $gte: start, $lte: end };
    }

    // Location filter
    if (locationId && locationId !== 'All locations') {
      filters.businessLocation = new mongoose.Types.ObjectId(locationId);
    }

    // Category filter
    if (categoryId && categoryId !== 'All') {
      filters.expenseCategory = new mongoose.Types.ObjectId(categoryId);
    }

    // Fetch expenses with the applied filters
    const expenses = await Expense.find(filters)
      .populate('businessLocation', 'name')
      .populate('expenseCategory', 'name')
      .populate('paidFrom', 'name accountNumber')
      .sort({ transactionDate: -1 });

    // Group expenses by category and calculate totals
    const expensesByCategory = {};
    let totalExpenseAmount = 0;

    for (const expense of expenses) {
      const categoryId = expense.expenseCategory?._id?.toString() || 'uncategorized';
      const categoryName = expense.expenseCategory?.name || 'Uncategorized';
      const amount = expense.amount || 0;

      if (!expensesByCategory[categoryId]) {
        expensesByCategory[categoryId] = {
          name: categoryName,
          total: 0,
          expenses: []
        };
      }

      expensesByCategory[categoryId].total += amount;
      expensesByCategory[categoryId].expenses.push({
        id: expense._id,
        referenceNo: expense.referenceNo,
        date: expense.transactionDate,
        amount: amount,
        location: expense.businessLocation?.name || 'Unknown location',
        paymentStatus: expense.paymentStatus || 'paid',
        paymentMethod: expense.paymentMethod || 'cash',
        expenseFor: expense.expenseFor || '',
        notes: expense.notes || ''
      });

      totalExpenseAmount += amount;
    }

    // Convert to array for easier sorting
    const categorySummary = Object.values(expensesByCategory).sort((a, b) => b.total - a.total);

    // Format response for chart data
    const chartData = categorySummary.map(category => ({
      name: category.name,
      totalExpense: category.total
    }));

    res.status(200).json({
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        locationId: locationId || 'All locations',
        categoryId: categoryId || 'All'
      },
      summary: {
        totalExpenseAmount: totalExpenseAmount,
        totalCategories: categorySummary.length
      },
      chartData: chartData,
      categoryDetails: categorySummary
    });
  } catch (err) {
    console.error('Error generating expense report:', err);
    res.status(500).json({ error: err.message });
  }
};

