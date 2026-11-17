import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { hashPassword } from '../src/auth.js';

export async function resetDb() {
  await migrate();
  await pool.query(
    'TRUNCATE attachments, messages, doubts, sessions, telegram_updates, users, courses RESTART IDENTITY CASCADE',
  );
  await pool.query(
    `INSERT INTO courses (code, name) VALUES ('MATH101', 'Mathematics'), ('CS301', 'Computer Science')`,
  );
  const educatorHash = hashPassword('educator123');
  const studentHash = hashPassword('student123');
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES
      ('Prof. Test', 'educator@test.dev', $1, 'educator'),
      ('Student One', 's1@test.dev', $2, 'student'),
      ('Student Two', 's2@test.dev', $2, 'student')`,
    [educatorHash, studentHash],
  );
}

export function loginAs(agent, request, app) {
  return request(app).post('/api/auth/login');
}
