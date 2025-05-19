const Contact = require('../../../models/contactModel');

exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Contact.findOneAndUpdate(
      { _id: req.params.id, contactType: 'Customer' },
      req.body,
      { new: true }
    );
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.status(200).json({ message: 'Customer updated successfully', customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};