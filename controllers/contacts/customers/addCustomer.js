const Contact = require('../../../models/contactModel');
const generateAutoId = require('../../../utils/generateAutoId');

exports.addCustomer = async (req, res) => {
  try {
    req.body.contactType = 'Customer';
    if (!req.body.contactId) {
      req.body.contactId = await generateAutoId('CONT');
    }
    const customer = await Contact.create(req.body);
    res.status(201).json({ message: 'Customer added successfully', customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};