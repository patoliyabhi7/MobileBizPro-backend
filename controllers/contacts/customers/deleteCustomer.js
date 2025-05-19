const Contact = require('../../../models/contactModel');

exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Contact.findOneAndDelete({ _id: req.params.id, contactType: 'Customer' });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.status(200).json({ message: 'Customer deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};