const mongoose = require('mongoose');

const fundTransferSchema = new mongoose.Schema({
  from_account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  to_account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  amount: { type: Number, required: true },
  note: { type: String },
  referenceNo: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  dateTime: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('FundTransfer', fundTransferSchema);
