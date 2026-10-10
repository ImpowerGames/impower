// Bounded tooling fixture; never loads or impersonates the real Vitest API.
// OS containment is still supplied by the production native supervisor.
import fs from "node:fs";
import path from "node:path";
const [mode, root, output, file] = process.argv.slice(2);
let control = {};
try { control = JSON.parse(fs.readFileSync(path.join(root, ".git", "engine-control.json"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
fs.appendFileSync(path.join(root, ".git", "engine-control-events.jsonl"), JSON.stringify({ mode, file, pid: process.pid,
  argv: process.argv.slice(2), execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS }) + "\n");
const names = fs.readdirSync(root).filter(name => /\.(test|spec)\.(ts|tsx)$/.test(name));
const specifications = names.map(name => ({ file: fs.realpathSync.native(path.join(root, name)), projectRoot: fs.realpathSync.native(root), projectName: "", pool: "forks" }));
const result = value => fs.writeFileSync(output, JSON.stringify(value));
if (mode === "discover") {
  if (control.discoverDelayMs) await new Promise(resolve => setTimeout(resolve, control.discoverDelayMs));
  result(specifications.map(spec => spec.file));
}
else if (mode === "select") result({ version: 1, specifications, coverage: { enabled: false } });
else if (mode === "merge") {
  if (control.mergeDelayMs) await new Promise(resolve => setTimeout(resolve, control.mergeDelayMs));
  result({ version: 1, status: control.mergeExit ? "failed" : "passed" });
  process.exitCode = control.mergeExit || 0;
} else {
  if(control.progress)fs.writeFileSync(path.join(path.dirname(output),"progress.json"),JSON.stringify({version:1,
    mode,file:file??null,sequence:1,event:"collected",at:new Date().toISOString()}));
  if (control.delayMs) await new Promise(resolve => setTimeout(resolve, control.delayMs));
  const exit = control.exit || 0, failed = exit !== 0;
  const report = { success: !failed, numTotalTests: 1, numPassedTests: failed ? 0 : 1, numFailedTests: failed ? 1 : 0,
    numPendingTests: 0, numTodoTests: 0, numTotalTestSuites: 1, numPassedTestSuites: failed ? 0 : 1,
    numFailedTestSuites: failed ? 1 : 0, numPendingTestSuites: 0,
    testResults: [{ name: file, status: failed ? "failed" : "passed", message: "", assertionResults: [{ fullName: "bounded fixture",
      status: failed ? "failed" : "passed", failureMessages: failed ? ["controlled failure"] : [] }] }] };
  console.log("Test Files  1 " + (failed ? "failed" : "passed") + " (1)");
  console.log("Tests  1 " + (failed ? "failed" : "passed") + " (1)");
  result(control.malformed ? [null] : report);
  fs.writeFileSync(path.join(path.dirname(output), "selection.json"), JSON.stringify({ version: 1, requested: file,
    status: "selected", specifications: specifications.filter(spec => spec.file === file) }));
  if (mode === "run-direct") fs.writeFileSync(path.join(path.dirname(output), "blob.json"), "controlled blob");
  process.exitCode = exit;
}
