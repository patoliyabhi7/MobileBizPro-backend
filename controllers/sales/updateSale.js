exports.updateSale = async (req, res) => {
  try {
    const saleId = req.params.id;
    const oldSale = await Sale.findById(saleId).lean();
    if (!oldSale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // 1) Determine businessLocation (from body or oldSale)
    const businessLocation = req.body.businessLocation || oldSale.businessLocation?.toString();
    if (!businessLocation) {
      return res.status(400).json({ error: 'businessLocation is required' });
    }

    // 2) Handle document replacement
    if (req.files?.length > 0 && Array.isArray(oldSale.documents)) {
      oldSale.documents.forEach(docPath => {
        if (fs.existsSync(docPath)) fs.unlinkSync(docPath);
      });
      req.body.documents = req.files.map(file => path.join('uploads', file.filename));
    }

    // 3) Handle payments parsing
    let newPayments = [];
    if ('payments' in req.body) {
      if (typeof req.body.payments === 'string') {
        try {
          newPayments = JSON.parse(req.body.payments);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid payments format' });
        }
      } else if (Array.isArray(req.body.payments)) {
        newPayments = req.body.payments;
      }

      // Assign a fresh ref no.
      const newRefNo = await generateAutoId('SALEPYMNT');
      newPayments = newPayments.map(p => ({
        ...p,
        paidOn: new Date(p.paidOn),
        paymentRefNo: newRefNo
      }));

      req.body.payments = newPayments;
    }

    req.body.addedBy = req.user.userId; // whoever is editing

    // 4) Revert old account balances & stock
    if (Array.isArray(oldSale.payments) && oldSale.payments.length > 0) {
      await revertAccountBalances(oldSale.payments, 'sale');
    }
    if (Array.isArray(oldSale.products) && oldSale.products.length > 0) {
      await revertStock(oldSale.products, businessLocation);
    }

    // 5) Apply the update
    const updatedSale = await Sale.findByIdAndUpdate(
      saleId,
      req.body,
      { new: true }
    )
      .populate('customer')
      .populate('businessLocation')
      .populate('addedBy', 'name _id')
      .populate('products.product')
      .populate('payments.account')
      .populate('payments.method');

    if (!updatedSale) {
      return res.status(404).json({ message: 'Sale not found after update' });
    }

    // 6) Consume stock for newly provided products (if any)
    if (Array.isArray(req.body.products) && req.body.products.length > 0) {
      await consumeStock(req.body.products);
    }

    // 7) Apply new payments
    if (newPayments.length > 0) {
      await updateAccountBalances(newPayments, 'sale');
    }

    res.status(200).json({ message: 'Sale updated successfully', sale: updatedSale });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};