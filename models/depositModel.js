const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  to_account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  amount: { type: Number, required: true },
  note: { type: String },
  added_by: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Deposit', depositSchema);
