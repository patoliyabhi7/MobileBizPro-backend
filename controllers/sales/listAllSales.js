const mongoose = require('mongoose');
const Sale = require('../../models/saleModel');

exports.listAllSales = async (req, res) => {
  try {
    const sales = await Sale.find({
      isDeleted: false
    })
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('payments.account')
      .populate('payments.method');

    res.status(200).json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
