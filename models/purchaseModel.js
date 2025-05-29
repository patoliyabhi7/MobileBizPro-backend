const mongoose = require('mongoose');

const purchaseProductSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  serialNo: String,
  imeiNo: String,
  color: String,
  storage: String,
  quantity: { type: Number, required: true },
  unitCost: { type: Number, required: true },
  lineTotal: { type: Number, required: true },
  note: String
});

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paidOn: { type: Date, required: true },
  method: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountType' },
  paymentDue: { type: Number },
  paymentRefNo: { type: String, required: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  bankAccountNo: { type: String },
  note: String
});

const purchaseSchema = new mongoose.Schema({
  referenceNo: { type: String, required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
  purchaseDate: { type: Date, required: true },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  payTerm: Number,
  payTermType: { type: String, enum: ['days', 'months', 'years'] },
  documents: [{ type: String }],
  products: [purchaseProductSchema],
  additionalNotes: String,
  payments: [paymentSchema],
  total: { type: Number, required: true },
  status: { type: String, enum: ['received', 'pending', 'ordered', 'return', 'cancelled'], default: 'received' },
  paymentStatus: { type: String, enum: ['paid', 'partial', 'due'], default: 'due' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Purchase', purchaseSchema);