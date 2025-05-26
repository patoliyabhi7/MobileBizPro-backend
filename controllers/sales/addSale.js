const Sale = require('../../models/saleModel');
const generateAutoId = require('../../utils/generateAutoId');

exports.addSale = async (req, res) => {
  try {
    const invoiceNo = req.body.invoiceNo || await generateAutoId('INV');
    req.body.addedBy = req.user.userId;
    const saleData = { ...req.body, invoiceNo };
    const sale = new Sale(saleData);
    await sale.save();
    const populatedSale = await Sale.findById(sale._id).populate('linkedAccount').populate('addedBy', 'name _id');
    res.status(201).json({ message: 'Sale added successfully', populatedSale });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};