const BusinessLocation = require('../../models/businessLocationModel');

exports.deleteBusinessLocation = async (req, res) => {
  try {
    const location = await BusinessLocation.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    if (!location) {
      return res.status(404).json({ error: 'Business location not found' });
    }

    res.json({ message: 'Business location marked as inactive', location });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
