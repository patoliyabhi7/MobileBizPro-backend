const mongoose = require('mongoose');

const purchaseProductSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  serialNo: String,
  imeiNo: { type: String },
  color: String,
  storage: String,
  quantity: { type: Number, required: true },
  unitCost: { type: Number, required: true },
  lineTotal: { type: Number, required: true },
  originalUnitCost: { type: Number },
  note: String,
  stockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock' },
  isReturn: { type: Boolean, default: false },
  noOfReturnProducts: { type: Number, default: 0 },
  returnDate: { type: Date },
  gstApplicable: { type: Boolean, default: false },
  gstPercentage: { type: Number, default: 18 },
  gstAmount: { type: Number, default: 0 },
  lineTotalWithGst: { type: Number, default: 0 }
});

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  paidOn: { type: Date, required: true },
  method: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountType' },
  paymentRefNo: { type: String, required: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  bankAccountNo: { type: String },
  forShopUse: { type: Boolean, default: false },
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
  paymentDue: { type: Number },
  status: { type: String, enum: ['received', 'pending', 'ordered', 'return', 'cancelled'], default: 'received' },
  paymentStatus: { type: String, enum: ['paid', 'partial', 'due'], default: 'due' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdFromReturn: { type: Boolean, default: false },
  saleReturnRef: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleReturn' },
  totalGstAmount: { type: Number, default: 0 },
  totalAmountWithGst: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Purchase', purchaseSchema);