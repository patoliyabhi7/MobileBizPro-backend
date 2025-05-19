const BusinessLocation = require('../../models/businessLocationModel');

exports.getAllBusinessLocations = async (req, res) => {
  try {
    const businessLocations = await BusinessLocation.find();
    res.status(200).json(businessLocations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
