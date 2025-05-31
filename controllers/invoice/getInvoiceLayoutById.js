const InvoiceLayout = require('../../models/invoiceLayoutModel');   

exports.getInvoiceLayoutById = async (req, res) => {
    try {
      const layout = await InvoiceLayout.findById(req.params.id);
      if (!layout || layout.isDeleted) return res.status(404).json({ error: 'Invoice layout not found' });
      res.status(200).json(layout);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };