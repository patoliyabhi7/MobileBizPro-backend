const Category = require('../../models/categoryModel');

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category soft-deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

