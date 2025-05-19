const Category = require('../../models/categoryModel');

exports.addCategory = async (req, res) => {
  try {
    const { name, code, description, parentCategory } = req.body;

    const existing = await Category.findOne({ $or: [{ name }, { code }] });
    if (existing) return res.status(400).json({ message: 'Category name or code already exists' });

    const category = new Category({
      name,
      code,
      description,
      parentCategory: parentCategory || null
    });

    await category.save();
    res.status(201).json({ message: 'Category added successfully', category });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
