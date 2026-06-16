// CI / pre-suite guard: fail if allowlist.yaml is malformed or violates a
// guardrail (missing field, TODO placeholder, property wildcard, region cap,
// bad date). Run: `npm run parity:validate-allowlist`.
import { loadAllowlist, validateAllowlist } from "../helpers/allowlist";

const al = loadAllowlist();
const issues = validateAllowlist(al, new Date());

if (issues.length) {
  console.error(`allowlist.yaml: ${issues.length} issue(s):`);
  for (const i of issues) console.error(`  [${i.id}] ${i.problem}`);
  process.exit(1);
}
console.log(`allowlist.yaml OK (${al.entries.length} entr${al.entries.length === 1 ? "y" : "ies"}).`);
