const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  imeiNo: { type: String },
  serialNo: { type: String },
  color: String,
  storage: String,
  purchaseRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  quantity: { type: Number, min: 0, default: 0 },
  businessLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessLocation',
    required: true
  },
  gstApplicable: { type: Boolean, default: false },
  gstPercentage: { type: Number, default: 18 },
}, { timestamps: true });

module.exports = mongoose.model('Stock', stockSchema);
