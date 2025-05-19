const Brand = require('../../models/brandModel');

exports.getBrands = async (req, res) => {
  try {
    const brands = await Brand.find();
    res.status(200).json(brands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
