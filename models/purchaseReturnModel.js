const mongoose = require('mongoose');

const purchaseReturnSchema = new mongoose.Schema({
  originalPurchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  referenceNo: { type: String, required: true },
  returnedProducts: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    serialNo: String,
    imeiNo: { type: String },
    color: String,
    storage: String,
    quantity: { type: Number },
    unitCost: { type: Number },
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
    amount: Number,
    paidOn: Date,
    method: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountType' },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    paymentRefNo: String,
    bankAccountNo: String,
    forShopUse: { type: Boolean, default: false },
    note: String
  }],
  returnDate: { type: Date, default: Date.now },
  totalGstAmount: { type: Number, default: 0 },
  totalReturnAmountWithGst: { type: Number, default: 0 },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });


module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);
