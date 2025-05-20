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
    const saleData = { ...req.body, invoiceNo };
    const sale = new Sale(saleData);
    await sale.save();
    res.status(201).json({ message: 'Sale added successfully', sale });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};