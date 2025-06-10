const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  to_account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  amount: { type: Number, required: true },
  note: { type: String },
  referenceNo: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  dateTime: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Deposit', depositSchema);
