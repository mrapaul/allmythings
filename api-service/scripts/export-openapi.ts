import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from '../src/app';

(async () => {
  const app = await buildApp({ disableRateLimit: true });
  await app.ready();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spec = (app as any).swagger();
  const out = resolve(__dirname, '../openapi.json');
  writeFileSync(out, JSON.stringify(spec, null, 2));
  await app.close();
  console.log('Wrote', out);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
