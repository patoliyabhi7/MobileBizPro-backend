const mongoose = require('mongoose');

const purchaseReturnSchema = new mongoose.Schema({
  originalPurchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  referenceNo: { type: String, required: true },
  returnedProducts: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    imeiNo: String,
    color: String,
    storage: String,
    lineTotal: Number,
    note: String,
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
    note: String
  }],
  returnDate: { type: Date, default: Date.now },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });


module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);
