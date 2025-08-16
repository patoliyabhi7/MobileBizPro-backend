const mongoose = require('mongoose');

const saleProductSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  serialNo: String,
  imeiNo: { type: String },
  color: String,
  storage: String,
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  lineTotal: { type: Number, required: true },
  note: String,
  stockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock' },
  purchaseRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  originalUnitCost: { type: Number },
  isReturn: { type: Boolean, default: false },
  returnDate: { type: Date },
  noOfReturnProduct: { type: Number, default: 0 },
  gstApplicable: { type: Boolean, default: false },
  gstPercentage: { type: Number, default: 18 },
  gstAmount: { type: Number, default: 0 },
  lineTotalWithGst: { type: Number, default: 0 },
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

const saleSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true },
  contactNumber: String,
  saleDate: { type: Date, required: true },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  payTerm: Number,
  payTermType: { type: String, enum: ['days', 'months', 'years'] },
  documents: [{ type: String }],
  products: [saleProductSchema],
  additionalNotes: String,
  staffNote: String,
  shippingDetails: String,
  payments: [paymentSchema],
  total: { type: Number, required: true },
  paymentDue: { type: Number },
  status: { type: String, enum: ['completed', 'return'], default: 'completed' },
  paymentStatus: { type: String, enum: ['paid', 'partial', 'due'], default: 'due' },
  shippingStatus: { type: String, enum: ['shipped', 'pending', "delivered"], default: 'pending' },
  totalItems: { type: Number },
  typesOfService: String,
  totalGstAmount: { type: Number, default: 0 },
  totalAmountWithGst: { type: Number, default: 0 },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Sale', saleSchema);
