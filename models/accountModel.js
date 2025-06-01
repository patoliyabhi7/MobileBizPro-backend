const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  account_number: { type: String, required: true },
  account_type: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountType', required: true },
  account_details: { type: String },
  balance: { type: Number, default: 0 },
  initialBalance: { type: Number, default: 0 },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }  ,
  note: { type: String },
  is_active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Account', accountSchema);