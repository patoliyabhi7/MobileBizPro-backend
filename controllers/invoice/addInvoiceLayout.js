const InvoiceLayout = require('../../models/invoiceLayoutModel');

exports.addInvoiceLayout = async (req, res) => {
    try {
      const {
        layoutName, shopName, slogan, address,
        mobileNumber, termsAndConditions
      } = req.body;
  
      const logo = req.file ? `uploads/${req.file.filename}` : undefined;
  
      const layout = new InvoiceLayout({
        layoutName,
        logo,
        shopName,
        slogan,
        address,
        mobileNumber,
        termsAndConditions
      });
  
      await layout.save();
      res.status(201).json({ message: 'Layout created', layout });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };