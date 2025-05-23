const Sale = require('../../models/saleModel');

const generateInvoiceNumber = async () => {
  const lastSale = await Sale.findOne().sort({ createdAt: -1 });
  let invoiceNumber = '00001';
  if (lastSale && lastSale.invoiceNo) {
    const lastNumber = parseInt(lastSale.invoiceNo, 10);
    const nextNumber = lastNumber + 1;
    invoiceNumber = String(nextNumber).padStart(4, '0');
  }
  return invoiceNumber;
};

exports.addSale = async (req, res) => {
  try {
    const invoiceNo = await generateInvoiceNumber();
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