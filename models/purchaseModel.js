const mongoose = require('mongoose');

const purchaseProductSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  serialNo: String,
  imeiNo: String,
  color: String,
  storage: String,
  quantity: { type: Number, required: true },
  unitCost: { type: Number, required: true },
  lineTotal: { type: Number, required: true }
});

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paidOn: { type: Date, required: true },
  method: { type: String, required: true },
  paymentDue: { type: Number },
  account: String,
  note: String
});

const purchaseSchema = new mongoose.Schema({
  referenceNo: { type: String, required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
  purchaseDate: { type: Date, required: true },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  payTerm: Number,
  payTermType: { type: String, enum: ['days', 'months'] },
  document: String,
  products: [purchaseProductSchema],
  additionalNotes: String,
  payments: [paymentSchema],
  total: { type: Number, required: true },
  status: { type: String, enum: ['received', 'pending', 'ordered', 'return', 'cancelled'], default: 'received' },
  paymentStatus: { type: String, enum: ['paid', 'partial', 'due'], default: 'due' },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  linkedAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Purchase', purchaseSchema);