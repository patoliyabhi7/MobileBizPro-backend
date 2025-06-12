const Category = require('../../models/categoryModel');

exports.updateCategory = async (req, res) => {
  try {
    const { name, code, description, parentCategory, isAcceptIMEI } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });

    if (name) category.name = name;
    if (code) category.code = code;
    if (description !== undefined) category.description = description;

    // Handle parentCategory properly - convert empty string to null
    if (parentCategory !== undefined) {
      category.parentCategory = parentCategory === "" ? null : parentCategory;
    }

    // Handle isAcceptIMEI field
    if (isAcceptIMEI !== undefined) {
      category.isAcceptIMEI = isAcceptIMEI;
    }

    await category.save();

    const updatedCategory = await Category.findById(req.params.id).populate('parentCategory', 'name');
    res.status(200).json({ message: 'Category updated successfully', updatedCategory });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
