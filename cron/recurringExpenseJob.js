const cron = require('node-cron');
const Expense = require('../models/expenseModel');
const generateAutoId = require('../utils/generateAutoId');
const mongoose = require('mongoose');
const dayjs = require('dayjs');

async function generateRecurringExpenses() {
  const todayUTC = dayjs().startOf('day');
  const utcStart = todayUTC.toDate();
  const utcEnd = todayUTC.endOf('day').toDate();

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

    const lastDate = lastExpense
      ? dayjs(lastExpense.transactionDate).startOf('day')
      : dayjs(parent.transactionDate).startOf('day');

    let nextDate = lastDate;

    if (parent.recurIntervalType === 'days') {
      nextDate = nextDate.add(parent.recurInterval, 'day');
    } else if (parent.recurIntervalType === 'months') {
      nextDate = nextDate.add(parent.recurInterval, 'month');
    } else if (parent.recurIntervalType === 'years') {
      nextDate = nextDate.add(parent.recurInterval, 'year');
    }

    // If nextDate is today or older, and we didn’t already create one for today
    if (!nextDate.isAfter(todayUTC)) {
      const alreadyExists = await Expense.findOne({
        recurParentId: parent._id,
        transactionDate: {
          $gte: utcStart,
          $lte: utcEnd
        }
      });

      if (alreadyExists) {
        console.log(`⚠️ Expense for ${parent.referenceNo} already exists today. Skipping.`);
        continue;
      }

      const parentObj = parent.toObject();
      delete parentObj._id;
      delete parentObj.createdAt;
      delete parentObj.updatedAt;
      delete parentObj.__v;

      const newExpense = new Expense({
        ...parentObj,
        _id: new mongoose.Types.ObjectId(),
        referenceNo: await generateAutoId('EXP'),
        transactionDate: todayUTC.toDate(),
        recurParentId: parent._id,
        isRecurring: false,
        recurInterval: undefined,
        recurIntervalType: undefined,
        recurRepetitions: undefined
      });

      try {
        await newExpense.save();
        console.log(`✅ New recurring expense created: ${newExpense.referenceNo}`);
      } catch (e) {
        console.error('❌ Failed to save new expense:', e);
        continue;
      }

      parent.recurRepetitions -= 1;
      try {
        await parent.save();
        console.log(`🔄 Updated parent expense: ${parent.referenceNo}, Remaining repetitions: ${parent.recurRepetitions}`);
      } catch (e) {
        console.error('❌ Failed to update parent expense:', e);
      }
    }
  }
}

// Schedule to run daily at 2 AM IST and 8:30PM UTC (adjust as needed)
cron.schedule('30 20 * * *', async () => {
  console.log(`[${new Date().toISOString()}] 🕒 Running Recurring Expense Job...`);
  try {
    await generateRecurringExpenses();
    console.log('✅ Recurring expense process completed.\n');
  } catch (err) {
    console.error('❌ Error processing recurring expenses:', err);
  }
});
