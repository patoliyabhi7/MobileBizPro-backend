const Brand = require('../../models/brandModel');

exports.addBrand = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) return res.status(400).json({ message: 'Brand name is required' });

    const existing = await Brand.findOne({ name });
    if (existing) return res.status(400).json({ message: 'Brand already exists' });

    const brand = new Brand({ name, description });
    await brand.save();

    res.status(201).json({ message: 'Brand created successfully', brand });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
