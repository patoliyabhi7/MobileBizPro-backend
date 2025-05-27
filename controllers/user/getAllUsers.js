const User = require('../../models/userModel');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ isDeleted: false });
    users.forEach(user => {
      user.password = undefined;
    });
    console.log(users);
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
