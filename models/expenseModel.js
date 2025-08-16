const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paidOn: { type: Date, required: true },
  method: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountType' },
  paymentRefNo: { type: String, required: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  bankAccountNo: { type: String },
  note: String
});

const expenseSchema = new mongoose.Schema({
  referenceNo: { type: String, required: true, unique: true },
  transactionDate: { type: Date, required: true },
  isRefund: { type: Boolean, default: false },
  isRecurring: { type: Boolean, default: false },
  recurInterval: { type: Number },
  recurIntervalType: { type: String, enum: ['days', 'months', 'years'] },
  recurRepetitions: { type: Number },
  recurParentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
  subCategory: String,
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  expenseFor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expenseForContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  documents: [{ type: String }],
  tax: Number,
  totalAmount: { type: Number, required: true },
  paymentDue: { type: Number },
  payments: [paymentSchema],
  paymentStatus: { type: String, enum: ['paid', 'partial', 'due'], default: 'due' },
  additionalNotes: String,
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// Remove recurring fields if isRefund is true
expenseSchema.pre('save', function (next) {
  if (this.isRefund) {
    this.isRecurring = false;
    this.recurInterval = undefined;
    this.recurIntervalType = undefined;
    this.recurRepetitions = undefined;
    this.recurParentId = undefined;
  }
  next();
});

module.exports = mongoose.model('Expense', expenseSchema);