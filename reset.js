// backend/resetAllPasswords.js
import db from './src/config/db.js'; // Adjust path to your database pool if needed
import bcrypt from 'bcryptjs';

async function resetAllUsers() {
  try {
    const defaultPassword = 'Password123';
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(defaultPassword, salt);

    // Update all users in the table with the new valid hash
    const [result] = await db.query(
      'UPDATE users SET password_hash = ?',
      [newHash]
    );

    console.log(`Successfully reset passwords for ${result.affectedRows} users!`);
    console.log(`Default password for all accounts is now: ${defaultPassword}`);
    process.exit(0);
  } catch (err) {
    console.error('Batch password reset failed:', err);
    process.exit(1);
  }
}

resetAllUsers();