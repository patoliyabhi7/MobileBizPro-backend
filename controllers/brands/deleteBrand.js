const Brand = require('../../models/brandModel');

exports.deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    res.json({ message: 'Brand marked as inactive', brand });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};