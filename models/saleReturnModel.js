const saleReturnSchema = new mongoose.Schema({
  originalSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true },
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
    amount: { type: Number, required: true },
    paidOn: { type: Date, default: Date.now },
    method: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountType' },
    paymentRefNo: String,
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    note: String
  }],
  returnDate: { type: Date, default: Date.now },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
