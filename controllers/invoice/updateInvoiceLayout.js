const fs = require('fs');
const InvoiceLayout = require('../../models/invoiceLayoutModel');

exports.updateInvoiceLayout = async (req, res) => {
    try {
      const layout = await InvoiceLayout.findById(req.params.id);
      if (!layout) return res.status(404).json({ message: 'Layout not found' });
  
      // Remove old logo file if new one uploaded
      if (req.file && layout.logo && fs.existsSync(layout.logo)) {
        fs.unlinkSync(layout.logo);
      }
  
      const updatedData = {
        layoutName: req.body.layoutName,
        shopName: req.body.shopName,
        slogan: req.body.slogan,
        address: req.body.address,
        mobileNumber: req.body.mobileNumber,
        termsAndConditions: req.body.termsAndConditions,
        logo: req.file ? `uploads/${req.file.filename}` : layout.logo
      };
  
      const updatedLayout = await InvoiceLayout.findByIdAndUpdate(req.params.id, updatedData, { new: true });
      res.status(200).json({ message: 'Layout updated', layout: updatedLayout });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };