// Demo seed: wipes all data and loads a realistic demo dataset.
// Usage: npm run seed   (never run against production data)
import { pool, withTransaction } from './db.js';
import { hashPassword } from './auth.js';

const DEMO_PASSWORDS = { educator: 'educator123', student: 'student123' };

async function seed() {
  await withTransaction(async (client) => {
    await client.query(
      'TRUNCATE attachments, messages, doubts, sessions, telegram_updates, telegram_link_codes, users, courses RESTART IDENTITY CASCADE',
    );

    const courses = await client.query(
      `INSERT INTO courses (code, name) VALUES
        ('MATH101', 'Mathematics'),
        ('PHY201',  'Physics'),
        ('CS301',   'Computer Science'),
        ('CHEM110', 'Chemistry'),
        ('BIO220',  'Biology'),
        ('ECO150',  'Economics')
       RETURNING id, code`,
    );
    const courseId = Object.fromEntries(courses.rows.map((c) => [c.code, c.id]));

    const educatorHash = hashPassword(DEMO_PASSWORDS.educator);
    const studentHash = hashPassword(DEMO_PASSWORDS.student);
    const users = await client.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES
        ('Prof. Ananya Rao', 'educator@doubtdesk.demo', $1, 'educator'),
        ('Aarav Mehta',  'aarav@doubtdesk.demo',  $2, 'student'),
        ('Sara Iqbal',   'sara@doubtdesk.demo',   $2, 'student'),
        ('Rohan Verma',  'rohan@doubtdesk.demo',  $2, 'student')
       RETURNING id, email`,
      [educatorHash, studentHash],
    );
    const uid = Object.fromEntries(users.rows.map((u) => [u.email, u.id]));
    const educator = uid['educator@doubtdesk.demo'];
    const aarav = uid['aarav@doubtdesk.demo'];
    const sara = uid['sara@doubtdesk.demo'];
    const rohan = uid['rohan@doubtdesk.demo'];

    async function doubt(student, course, title, description, status, messages, ageHours) {
      const { rows } = await client.query(
        `INSERT INTO doubts (student_id, course_id, title, description, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now() - ($6 || ' hours')::interval, now() - ($7 || ' hours')::interval)
         RETURNING id`,
        [student, course, title, description, status, ageHours, Math.max(ageHours - 1, 0)],
      );
      const doubtId = rows[0].id;
      for (const [i, [sender, body]] of messages.entries()) {
        await client.query(
          `INSERT INTO messages (doubt_id, sender_id, body, created_at)
           VALUES ($1, $2, $3, now() - ($4 || ' hours')::interval)`,
          [doubtId, sender, body, Math.max(ageHours - 0.2 * (i + 1), 0)],
        );
      }
      return doubtId;
    }

    await doubt(aarav, courseId['MATH101'],
      'Integration by parts for x^2 * e^x',
      'How do I integrate x^2 * e^x? I tried taking u = e^x but the expression keeps getting more complicated instead of simpler.',
      'resolved',
      [
        [educator, 'Choose u = x^2 and dv = e^x dx. Then apply integration by parts twice - each round reduces the power of x by one until you reach a plain e^x integral.'],
        [aarav, 'Got it - after the second round the x term is gone and only a plain e^x integral is left, so e^x(x^2 - 2x + 2) + C. Thanks!'],
        [educator, 'That is correct - differentiating e^x(x^2 - 2x + 2) gives back x^2 e^x. Marking this resolved - try x^2 * sin(x) the same way for practice.'],
      ], 30);

    await doubt(sara, courseId['CS301'],
      'Why does my binary search loop forever?',
      'My binary search works on some arrays but loops forever on others. I set low = mid and high = mid when narrowing down. What am I doing wrong?',
      'answered',
      [
        [educator, 'Classic off-by-one: when low == mid the range never shrinks. Use low = mid + 1 (or high = mid - 1) so every iteration strictly shrinks the interval, and compute mid as low + (high - low) / 2 to avoid overflow.'],
      ], 20);

    await doubt(aarav, courseId['PHY201'],
      'Direction of friction on an inclined plane',
      'A block slides UP an inclined plane after an initial push. Which way does kinetic friction act while it is moving up? My friend says friction always acts down the plane.',
      'open', [], 6);

    await doubt(rohan, courseId['CHEM110'],
      'Why is the boiling point of water higher than ethanol?',
      'Ethanol has a higher molecular mass than water, so by trend it should boil at a higher temperature. But water boils at 100 C and ethanol at 78 C. What explains this?',
      'open', [], 3);

    await doubt(sara, courseId['ECO150'],
      'Price ceiling below equilibrium - shortage or surplus?',
      'If the government sets a maximum price below the equilibrium price in a market, do we get a shortage or a surplus? A diagram reference would really help.',
      'in_progress',
      [
        [educator, 'Think about quantities at that lower price: what happens to quantity demanded versus quantity supplied? I will post a full explanation shortly.'],
      ], 12);

    await doubt(rohan, courseId['CS301'],
      'Difference between HTTP 401 and 403',
      'When should an API return 401 versus 403? Both seem to mean "you cannot access this".',
      'in_progress',
      [
        [educator, '401 means unauthenticated - we do not know who you are (log in first). 403 means authenticated but not allowed - we know who you are and this resource is not yours. This very portal uses exactly that split.'],
        [rohan, 'That is a neat way to remember it, thanks!'],
      ], 26);
  });

  console.log('seeded demo data');
  console.log('  educator login: educator@doubtdesk.demo /', DEMO_PASSWORDS.educator);
  console.log('  student logins: aarav@ / sara@ / rohan@doubtdesk.demo /', DEMO_PASSWORDS.student);
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
  });
