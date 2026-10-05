import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

// Preparation only: generate an external config without starting a service.
// An independently audited hard-deadline/process-census outer guard is still
// required. This generator and the preserved helper have not been executed.
const [phase, repoArgument, evidenceArgument, profileArgument, session, deadlineArgument, expectedHead, beforeReport] = process.argv.slice(2);
assert.ok(["before", "after"].includes(phase), "before|after repo evidence profile session deadlineMs expectedHead [beforeReport]");
assert.ok([repoArgument, evidenceArgument, profileArgument].every(value => value && path.isAbsolute(value)), "use actual absolute machine paths");
assert.match(expectedHead, /^[a-f0-9]{40}$/);
assert.ok(session && /^[a-zA-Z0-9_-]+$/.test(session));
const repoRoot = path.resolve(repoArgument);
const evidenceRoot = path.resolve(evidenceArgument);
const profile = path.resolve(profileArgument);
assert.ok(evidenceRoot !== repoRoot && !evidenceRoot.startsWith(repoRoot + path.sep));
assert.ok(profile !== repoRoot && !profile.startsWith(repoRoot + path.sep));
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(), expectedHead);
execFileSync("git", ["diff", "--exit-code"], { cwd: repoRoot, stdio: "pipe" });
execFileSync("git", ["diff", "--cached", "--exit-code"], { cwd: repoRoot, stdio: "pipe" });
const deadlineMs = Number(deadlineArgument);
assert.ok(Number.isSafeInteger(deadlineMs) && deadlineMs > Date.now());
if (phase === "before") assert.equal(expectedHead, "f5837205e8ec617c0f385c7d1346359d0174cfcc");
else assert.ok(beforeReport && path.isAbsolute(beforeReport));
const packetRoot = path.join(repoRoot, "docs/verification/1374");
const fixturesRoot = path.join(packetRoot, "fixtures");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const names = {
  renameCanonical: "fixtures/rename/main.sd",
  renameMarked: "fixtures/rename-marked.sd",
  extensionMarked: "fixtures/extension-marked.sd",
  attributeCanonical: "fixtures/artwork/main.sd",
  attributeMarked: "fixtures/artwork-marked.sd",
  attributeDefinitions: "fixtures/artwork/scripts/definitions.sd",
  attributeSvg: "fixtures/artwork/assets/mia.svg",
  vscodeProbe: "workbench-source-probe.js",
};
const fixtures = Object.fromEntries(Object.entries(names).map(([name, relative]) => {
  const filename = path.join(packetRoot, relative);
  return [name, { path: filename, sha256: sha(fs.readFileSync(filename)) }];
}));
const sourceNames = [
  "packages/sparkdown-language-server/src/utils/providers/getSymbol.ts",
  "packages/sparkdown-language-server/src/utils/providers/getCompletions.ts",
  "packages/sparkdown/src/compiler/lower/utils/validateAssignmentValue.ts",
  "packages/sparkdown/src/compiler/lower/utils/validateExplicitStatement.ts",
  "packages/sparkdown/src/compiler/lower/lowerers/lowerExplicitStatement.ts",
];
const output = path.join(evidenceRoot, phase);
assert.equal(fs.existsSync(output), false, "use fresh evidence output");
fs.mkdirSync(evidenceRoot, { recursive: true });
const configPath = path.join(evidenceRoot, `${phase}-config.json`);
assert.equal(fs.existsSync(configPath), false, "never overwrite a historical config");
const config = {
  phase, repoRoot, expectedHead, session, profile, output, deadlineMs, fixtures,
  project: path.join(fixturesRoot, "artwork"),
  renameProject: path.join(fixturesRoot, "rename"),
  acceptedErrorRecords: { pageErrors: [], workbenchErrors: [] },
  sourceHashes: sourceNames.map(relative => {
    const filename = path.join(repoRoot, relative);
    return fs.existsSync(filename) ? { path: relative, sha256: sha(fs.readFileSync(filename)) } : { path: relative, state: "deleted" };
  }),
  ...(phase === "after" ? { beforeReport } : {}),
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ configPath, configSha256: sha(fs.readFileSync(configPath)), helper: path.join(packetRoot, "live-phase.mjs"), config, servicesStarted: false }, null, 2));
