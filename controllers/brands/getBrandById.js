const Brand = require('../../models/brandModel');

exports.getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand || brand.isDeleted) return res.status(404).json({ message: 'Brand not found' });

    res.status(200).json(brand);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
