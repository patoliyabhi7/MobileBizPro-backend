const BusinessLocation = require('../../models/businessLocationModel');

exports.updateBusinessLocation = async (req, res) => {
  try {
    const businessLocation = await BusinessLocation.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!businessLocation) return res.status(404).json({ message: 'Business Location not found' });
    res.status(200).json({ message: 'Business Location updated successfully', businessLocation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
