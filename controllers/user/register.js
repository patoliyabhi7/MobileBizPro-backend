const User = require('../../models/userModel');
const bcrypt = require('bcryptjs');

exports.registerUser = async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;

    if (!name || !username || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // check existing user
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ message: 'Username or Email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);

    // if file uploaded, get filename, else null
    const profilePhoto = req.file ? req.file.path : null;

    const user = new User({
      name,
      username,
      email,
      password: hashedPassword,
      role: role || 'employee',
      profilePhoto,
    });

    await user.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        profilePhoto: user.profilePhoto,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
