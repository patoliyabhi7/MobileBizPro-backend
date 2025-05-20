const mongoose = require('mongoose');

const businessLocationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    zipCode: { type: String },
    phone: { type: String },
    email: { type: String },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('BusinessLocation', businessLocationSchema);
