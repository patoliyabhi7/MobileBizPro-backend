const Sale = require('../../models/saleModel');

exports.updateSale = async (req, res) => {
    try {
      if (req.files && req.files.length > 0) {
        // Delete existing files
        if (expense.documents && expense.documents.length > 0) {
          expense.documents.forEach(doc => {
            if (fs.existsSync(doc)) fs.unlinkSync(doc);
          });
        }
      
        // Add new files
        expense.documents = req.files.map(file => file.path);
      }      
      req.body.addedBy = req.user.userId;
      const sale = await Sale.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!sale) {
        return res.status(404).json({ message: 'Sale not found' });
      }
      res.status(200).json(sale.populate('addedBy', 'name _id'));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };