const Contact = require('../../../models/contactModel');

exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Contact.findOneAndUpdate(
      { _id: req.params.id, contactType: 'Customer' },
      { isDeleted: true },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.status(200).json({
      message: 'Customer soft-deleted successfully',
      customer
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
