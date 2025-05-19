const Contact = require('../../../models/contactModel');

exports.updateSupplier = async (req, res) => {
  try {
    const updated = await Contact.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.status(200).json({ message: 'Supplier updated', supplier: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};