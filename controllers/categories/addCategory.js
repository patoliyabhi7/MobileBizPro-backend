const Category = require('../../models/categoryModel');

exports.addCategory = async (req, res) => {
  try {
    const { name, code, description, parentCategory, isAcceptIMEI } = req.body;

    const existing = await Category.findOne({ $or: [{ name }, { code }] });
    if (existing) return res.status(400).json({ message: 'Category name or code already exists' });

    const category = new Category({
      name,
      code,
      description,
      parentCategory: parentCategory || null,
      isAcceptIMEI: isAcceptIMEI || false
    });

    await category.save();

    const categoryWithParent = await Category.findById(category._id).populate('parentCategory', 'name');
    res.status(201).json({ message: 'Category added successfully', categoryWithParent });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
