const BusinessLocation = require('../../models/businessLocationModel');

exports.getBusinessLocationById = async (req, res) => {
  try {
    const businessLocation = await BusinessLocation.findById(req.params.id);
    if (!businessLocation || businessLocation.isDeleted) return res.status(404).json({ message: 'Business Location not found' });
    res.status(200).json(businessLocation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
