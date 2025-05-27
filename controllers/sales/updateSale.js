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
      if ('payments' in req.body) {
        let payments = [];
      
        if (typeof req.body.payments === 'string') {
          try {
            payments = JSON.parse(req.body.payments);
          } catch (e) {
            return res.status(400).json({ error: 'Invalid payments format' });
          }
        } else if (Array.isArray(req.body.payments)) {
          payments = req.body.payments;
        }
      
        // Format dates
        payments = payments.map(p => ({
          ...p,
          paidOn: new Date(p.paidOn),
        }));
      
        req.body.payments = payments;
      }
      req.body.addedBy = req.user.userId;
      const updatedSale = await Sale.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      ).populate('addedBy', 'name _id').populate('linkedAccount');
      if (!updatedSale) {
        return res.status(404).json({ message: 'Sale not found' });
      }
      res.status(200).json({ message: 'Sale updated successfully', updatedSale });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };