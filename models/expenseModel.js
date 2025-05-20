const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paidOn: { type: Date, required: true },
  method: { type: String, required: true },
  account: String,
  note: String
});

const expenseSchema = new mongoose.Schema({
  referenceNo: { type: String, required: true, unique: true },
  transactionDate: { type: Date, required: true },
  isRecurring: { type: Boolean, default: false },
  recurInterval: { type: Number },
  recurIntervalType: { type: String, enum: ['days', 'months'] },
  recurRepetitions: { type: Number },
  recurParentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
  subCategory: String,
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  expenseFor: String,
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  document: String,
  tax: Number,
  totalAmount: { type: Number, required: true },
  payments: [paymentSchema],
  paymentStatus: { type: String, enum: ['paid', 'partial', 'due'], default: 'due' },
  additionalNotes: String,
  addedBy: { type: String, required: true },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);