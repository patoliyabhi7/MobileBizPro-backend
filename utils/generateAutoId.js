const Counter = require('../models/counterModel');

async function generateAutoId(prefixBase, year = new Date().getFullYear()) {
  const prefix = `${prefixBase}${year}`;
  const counter = await Counter.findOneAndUpdate(
    { prefix },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const formattedSeq = String(counter.seq).padStart(4, '0');
  return `${prefix}/${formattedSeq}`;
}

module.exports = generateAutoId;
