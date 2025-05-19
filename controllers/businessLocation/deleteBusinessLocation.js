const BusinessLocation = require('../../models/businessLocationModel');

exports.deleteBusinessLocation = async (req, res) => {
  try {
    const businessLocation = await BusinessLocation.findByIdAndDelete(req.params.id);
    if (!businessLocation) return res.status(404).json({ message: 'Business Location not found' });
    res.status(200).json({ message: 'Business Location deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
