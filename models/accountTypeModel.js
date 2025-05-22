const mongoose = require('mongoose');

const accountTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  parentType: {
    type: String,
    enum: ['Bank', 'Cash'],
    required: true
  },
  note: {
    type: String,
    trim: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('AccountType', accountTypeSchema);
