const InvoiceLayout = require('../../models/invoiceLayoutModel');   

exports.getAllInvoiceLayouts = async (req, res) => {
    try {
      const layouts = await InvoiceLayout.find({ isDeleted: false }).sort({ createdAt: -1 });
      res.status(200).json(layouts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };