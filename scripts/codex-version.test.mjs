import assert from "node:assert/strict";
import { minimumCodexVersion, isSupportedCodexVersion } from "./reviewer-security.mjs";

// The native Codex route accepts the build its sandbox guarantees were
// observed on and any later release; earlier builds and prereleases are refused.
assert.equal(isSupportedCodexVersion(minimumCodexVersion), true);
for (const version of ["0.154.1", "0.159.0", "0.200.0", "1.0.0", " 0.159.0\n"]) {
  assert.equal(isSupportedCodexVersion(version), true, version);
}
for (const version of ["0.153.9", "0.99.0", "0.154.0-alpha.6.2", "0.160.0-alpha.1", "0.159", "", "codex-cli 0.159.0", undefined, null]) {
  assert.equal(isSupportedCodexVersion(version), false, String(version));
}
console.log("codex-version: ok");
