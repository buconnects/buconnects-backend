// GET /api/v1/users (Protected: DEVELOPER or ADMIN only)
export const getAllUsers = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, full_name, email, role, phone_number, created_at FROM users ORDER BY created_at DESC'
    );
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve system users' });
  }
};