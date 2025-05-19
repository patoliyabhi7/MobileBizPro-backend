const BusinessLocation = require('../../models/businessLocationModel');

exports.addBusinessLocation = async (req, res) => {
  try {
    const businessLocation = await BusinessLocation.create(req.body);
    res.status(201).json({ message: 'Business Location created successfully', businessLocation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
