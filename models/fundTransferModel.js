const mongoose = require('mongoose');

const fundTransferSchema = new mongoose.Schema({
  from_account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  to_account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  amount: { type: Number, required: true },
  note: { type: String },
  added_by: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('FundTransfer', fundTransferSchema);
