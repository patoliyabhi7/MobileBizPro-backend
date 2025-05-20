const Contact = require('../../../models/contactModel');

exports.deleteSupplier = async (req, res) => {
  try {
    const supplier = await Contact.findOneAndUpdate(
      { _id: req.params.id, contactType: 'Supplier' },
      { isDeleted: true },
      { new: true }
    );

    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    res.status(200).json({
      message: 'Supplier soft-deleted successfully',
      supplier
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
