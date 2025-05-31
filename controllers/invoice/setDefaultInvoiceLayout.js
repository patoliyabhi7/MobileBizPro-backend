const InvoiceLayout = require('../../models/invoiceLayoutModel');   

exports.setDefaultInvoiceLayout = async (req, res) => {
    try {
      await InvoiceLayout.updateMany({}, { isDefault: false });
      const updated = await InvoiceLayout.findByIdAndUpdate(
        req.params.id,
        { isDefault: true },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Invoice layout not found' });
      res.status(200).json({ message: 'Default layout set', layout: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };