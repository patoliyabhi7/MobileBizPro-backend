const Category = require('../../models/categoryModel');

exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isDeleted: false }).populate('parentCategory', 'name');
    res.status(200).json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
