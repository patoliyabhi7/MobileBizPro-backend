const mongoose = require('mongoose');

const saleReturnSchema = new mongoose.Schema({
  originalSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
  businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation', required: true },
  returnedProducts: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    imeiNo: String,
    color: String,
    storage: String,
    lineTotal: Number,
    note: String,
  }],
  totalReturnAmount: { type: Number, required: true },
  returnDate: { type: Date, default: Date.now },
  returnPayments: [{
    amount: Number,
    paidOn: Date,
    method: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountType' },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    paymentRefNo: String,
    note: String
  }],
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('SaleReturn', saleReturnSchema);
