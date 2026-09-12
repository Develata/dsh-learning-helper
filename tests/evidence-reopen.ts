import { SqliteEvidenceStore } from '../src/providers/evidence-sqlite.js';
const store = new SqliteEvidenceStore(process.argv[2]!);
try { console.log(JSON.stringify(store.search('course-a', '一致连续', 5, new AbortController().signal))); }
finally { store.close(); }
