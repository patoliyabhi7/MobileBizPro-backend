const cron = require('node-cron');
const Expense = require('../models/expenseModel');
const generateAutoId = require('../utils/generateAutoId'); 
const mongoose = require('mongoose');

async function generateRecurringExpenses() {
  const today = new Date();

  const recurringExpenses = await Expense.find({
    isRecurring: true,
    isDeleted: false,
    isRefund: false,
    recurRepetitions: { $gt: 0 }
  });

  for (const parent of recurringExpenses) {
    const lastExpense = await Expense.findOne({
      recurParentId: parent._id
    }).sort({ transactionDate: -1 });

    const lastDate = lastExpense ? lastExpense.transactionDate : parent.transactionDate;
    const nextDate = new Date(lastDate);

    if (parent.recurIntervalType === 'days') {
      nextDate.setDate(nextDate.getDate() + parent.recurInterval);
    } else if (parent.recurIntervalType === 'months') {
      nextDate.setMonth(nextDate.getMonth() + parent.recurInterval);
    } else if (parent.recurIntervalType === 'years') {
      nextDate.setFullYear(nextDate.getFullYear() + parent.recurInterval);
    }

    if (nextDate.toDateString() === today.toDateString()) {
      const newExpense = new Expense({
        ...parent.toObject(),
        _id: new mongoose.Types.ObjectId(),
        referenceNo: await generateAutoId('EXP'),
        transactionDate: today,
        recurParentId: parent._id,
        isRecurring: false,
        recurInterval: undefined,
        recurIntervalType: undefined,
        recurRepetitions: undefined
      });

      await newExpense.save();

      parent.recurRepetitions -= 1;
      await parent.save();
    }
  }
}

// Schedule: every day at 5:00 AM
cron.schedule('0 5 * * *', async () => {
  console.log('⏰ Running Recurring Expense Job at 5:00 AM...');
  try {
    await generateRecurringExpenses();
    console.log('Recurring expenses processed.');
  } catch (err) {
    console.error('Error processing recurring expenses:', err.message);
  }
});
