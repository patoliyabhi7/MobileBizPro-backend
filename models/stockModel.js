const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  imeiNo: { type: String, unique: true, sparse: true },
  serialNo: { type: String, unique: true, sparse: true },
  color: String,
  storage: String,
  purchaseRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  status: {
    type: Number,
    enum: [0, 1],
    default: 1 // 1 = in stock, 0 = sold or returned
  },
  businessLocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessLocation',
    required: true
  }
  
}, { timestamps: true });

module.exports = mongoose.model('Stock', stockSchema);
