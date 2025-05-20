const ExpenseCategory = require('../../models/expenseCategoryModel');

exports.deleteExpenseCategory = async (req, res) => {
    try {
        const category = await ExpenseCategory.findByIdAndUpdate(
            req.params.id,
            { isDeleted: true },
            { new: true }
          );
        if (!category) return res.status(404).json({ message: 'Category not found' });
        res.status(200).json({ message: 'Expense Category deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};