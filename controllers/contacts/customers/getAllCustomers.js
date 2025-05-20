const Contact = require('../../../models/contactModel');

exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Contact.find({ contactType: 'Customer', isDeleted: false });
    res.status(200).json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
