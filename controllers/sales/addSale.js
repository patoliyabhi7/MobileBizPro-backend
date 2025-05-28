const Sale = require('../../models/saleModel');
const generateAutoId = require('../../utils/generateAutoId');
const { updateAccountBalances } = require('../../utils/updateAccountBalance');

exports.addSale = async (req, res) => {
  try {
    const invoiceNo = req.body.invoiceNo || await generateAutoId('INV');
    req.body.addedBy = req.user.userId;
    // If payments are sent as JSON string (common in multipart form-data), parse them
    let payments = [];
    if (req.body.payments) {
      if (typeof req.body.payments === 'string') {
        try {
          payments = JSON.parse(req.body.payments);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid payments format' });
        }
      } else if (Array.isArray(req.body.payments)) {
        payments = req.body.payments;
      }
    
      // Format date fields
      payments = payments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
      }));
    }
    const filePaths = req.files?.map(file => `uploads/${file.filename}`) || [];
    const saleData = { ...req.body, invoiceNo, documents: filePaths, payments };
    const sale = new Sale(saleData);
    await sale.save();
    if (sale.payments && sale.payments.length > 0) {
      await updateAccountBalances(sale.payments, 'sale');
    }
    const populatedSale = await Sale.findById(sale._id).populate('payments.account').populate('addedBy', 'name _id').populate('customer')
    .populate('businessLocation');
    res.status(201).json({ message: 'Sale added successfully', populatedSale });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};