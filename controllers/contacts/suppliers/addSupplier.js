const Contact = require('../../../models/contactModel');
const generateAutoId = require('../../../utils/generateAutoId');

exports.addSupplier = async (req, res) => {
  try {
    const supplierData = { ...req.body, contactType: 'Supplier' };
    if (!req.body.contactId) {
      req.body.contactId = await generateAutoId('CONT');
    }
    const supplier = await Contact.create(supplierData);
    res.status(201).json({ message: 'Supplier added successfully', supplier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};