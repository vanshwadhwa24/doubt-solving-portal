import pg from '../../server/node_modules/pg/lib/index.js';
import fs from 'node:fs';
const c = new pg.Client({ connectionString: 'postgres://portal:portal@localhost:5432/doubt_portal' });
await c.connect();
for (const st of fs.readFileSync(new URL('./seed-20k.sql', import.meta.url).pathname,'utf8').split(/;\n/).filter(x=>x.trim())) await c.query(st);
console.log((await c.query('select count(*) from doubts')).rows[0]);
await c.end();
