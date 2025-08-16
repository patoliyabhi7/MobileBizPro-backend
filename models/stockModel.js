const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  imeiNo: { type: String },
  serialNo: { type: String },
  color: String,
  storage: String,
  initialQuantity: { type: Number, min: 0, default: 1 }, // total purchased quantity
  quantity: { type: Number, min: 0, default: 1 }, // remaining unsold quantity
  unitCost: { type: Number, default: 0 },
  businessLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessLocation',
    required: true
  },
  gstApplicable: { type: Boolean, default: false },
  gstPercentage: { type: Number, default: 18 },
  status: { type: Number, enum: [0, 1], default: 1 }, // 0 = sold, 1 = available (for mobiles)
}, { timestamps: true });

module.exports = mongoose.model('Stock', stockSchema);