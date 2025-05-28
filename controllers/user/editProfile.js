const User = require('../../models/userModel');
const fs = require('fs');
const path = require('path');

exports.editProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, username, email} = req.body;

    const user = await User.findById(userId);
    if (!user) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: 'User not found' });
    }

    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser && existingUser._id.toString() !== userId) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'Username already taken' });
      }
      user.username = username;
    }

    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail && existingEmail._id.toString() !== userId) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'Email already taken' });
      }
      user.email = email;
    }

    if (name) user.name = name;

    if (req.file) {
      if (user.profilePhoto && fs.existsSync(user.profilePhoto)) {
        fs.unlinkSync(user.profilePhoto); // delete old
      }
      user.profilePhoto = req.file.path;
    }

    await user.save();

    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        profilePhoto: user.profilePhoto || null,
      },
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
};
