const Contact = require('../../../models/contactModel');

exports.getAllSuppliers = async (req, res) => {
  try {
    const suppliers = await Contact.find({ contactType: 'Supplier' });
    res.status(200).json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};