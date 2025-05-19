const Brand = require('../../models/brandModel');

exports.updateBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const brand = await Brand.findById(id);
    if (!brand) return res.status(404).json({ message: 'Brand not found' });

    if (name) brand.name = name;
    if (description !== undefined) brand.description = description;

    await brand.save();

    res.status(200).json({ message: 'Brand updated successfully', brand });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
