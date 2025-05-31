const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    name: { type: String, required: true },                  // Name of the scheme
    prefix: { type: String},               // Example: "INV"
    numberingType: { type: String, enum: ['sequential', 'random'] },       // "sequential" or "random"
    startFrom: { type: Number},           // Starting number, e.g., 1
    invoiceCount: { type: Number},        // Current count
    numberOfDigits: { type: Number},      // e.g., 4 for 0001
    isDefault: { type: Boolean, default: false },          // To mark as default
    businessLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessLocation' },   // Optional if per location
}, { timestamps: true });

module.exports = mongoose.model('InvoiceLayout', invoiceSchema);