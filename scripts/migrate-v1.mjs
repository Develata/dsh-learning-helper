import { migrateV1 } from '../dist/workspace/migration.js';
const args = process.argv.slice(2).filter(a => a !== '--'); const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--offline') options.offline = true;
  else if (['--course', '--workspace', '--dsh-home'].includes(args[i])) options[{ '--course': 'courseId', '--workspace': 'workspace', '--dsh-home': 'dshHome' }[args[i]]] = args[++i];
  else throw new Error('Usage: pnpm migrate:v1 -- --course ID --workspace PATH --dsh-home PATH --offline');
}
try { console.log(JSON.stringify(await migrateV1(options), null, 2)); }
catch (error) { console.error(error instanceof Error ? error.message : 'Migration failed'); process.exitCode = 1; }
