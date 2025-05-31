const mongoose = require('mongoose');

const invoiceLayoutSchema = new mongoose.Schema({
  layoutName: { type: String, required: true },
  logo: { type: String }, // path to logo file
  shopName: { type: String, required: true },
  slogan: { type: String },
  address: { type: String },
  mobileNumber: { type: String },
  termsAndConditions: { type: String },
  isDefault: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('InvoiceLayout', invoiceLayoutSchema);
