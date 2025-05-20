const BusinessLocation = require('../../models/businessLocationModel');

exports.getAllBusinessLocations = async (req, res) => {
  try {
    const locations = await BusinessLocation.find({ isDeleted: false });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
