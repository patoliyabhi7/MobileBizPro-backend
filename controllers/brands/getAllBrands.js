const Brand = require('../../models/brandModel');

exports.getAllBrands = async (req, res) => {
  try {
    const brands = await Brand.find({ isDeleted: false });
    res.json(brands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
