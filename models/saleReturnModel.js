const mongoose = require('mongoose');

const saleReturnSchema = new mongoose.Schema({
  originalSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
  newPurchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  referenceNo: { type: String, required: true },
  returnedProducts: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    stockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock' },
    purchaseRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    serialNo: String,
    imeiNo: { type: String },
    color: String,
    storage: String,
    quantity: { type: Number },
    unitCost: { type: Number },
    originalUnitCost: { type: Number },
    lineTotal: { type: Number },
    note: String,
    gstApplicable: { type: Boolean, default: false },
    gstPercentage: { type: Number, default: 18 },
    gstAmount: { type: Number, default: 0 },
    lineTotalWithGst: { type: Number, default: 0 },
  }],
  totalReturnAmount: { type: Number, required: true },
  paymentStatus: { type: String, enum: ['paid', 'partial', 'due'], default: 'due' },
  paymentDue: { type: Number, default: 0 },
  returnPayments: [{
    amount: { type: Number, required: true },
    paidOn: { type: Date, default: Date.now },
    method: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountType' },
    paymentRefNo: String,
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    forShopUse: { type: Boolean, default: false },
    note: String
  }],
  returnDate: { type: Date, default: Date.now },
  totalGstAmount: { type: Number, default: 0 },
  totalReturnAmountWithGst: { type: Number, default: 0 },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('SaleReturn', saleReturnSchema);
