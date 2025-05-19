const Brand = require('../../models/brandModel');

exports.deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const brand = await Brand.findByIdAndDelete(id);

    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    res.status(200).json({ message: 'Brand deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
