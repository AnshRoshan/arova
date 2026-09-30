require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query('select calls, input_tokens, output_tokens, estimated from model_usage where day = current_date order by created_at desc limit 4');
  for (const x of r.rows) console.log(`calls=${x.calls} in=${x.input_tokens} out=${x.output_tokens} estimated=${x.estimated}`);
  const any = await c.query('select count(*)::int as n from model_usage where estimated = false');
  console.log('rows with exact counts:', any.rows[0].n);
  await c.end();
})().catch(e => console.log('ERR', e.message));
