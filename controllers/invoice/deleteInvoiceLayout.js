const InvoiceLayout = require('../../models/invoiceLayoutModel');   
const fs = require('fs');

exports.deleteInvoiceLayout = async (req, res) => {
    try {
      const updated = await InvoiceLayout.findByIdAndUpdate(
        req.params.id,
        { isDeleted: true },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: 'Invoice layout not found' });
      if (updated.logo && fs.existsSync(updated.logo)) {
        fs.unlinkSync(updated.logo);
      }
      res.status(200).json({ message: 'Invoice layout deleted', layout: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };