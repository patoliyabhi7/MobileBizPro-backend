const Contact = require('../../../models/contactModel');

exports.addSupplier = async (req, res) => {
  try {
    const supplierData = { ...req.body, contactType: 'Supplier' };
    const supplier = await Contact.create(supplierData);
    res.status(201).json({ message: 'Supplier added successfully', supplier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};