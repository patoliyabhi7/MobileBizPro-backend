const Contact = require('../../../models/contactModel');

exports.getSupplierById = async (req, res) => {
  try {
    const supplier = await Contact.findById(req.params.id);
    if (!supplier || supplier.contactType !== 'Supplier') {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.status(200).json(supplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};