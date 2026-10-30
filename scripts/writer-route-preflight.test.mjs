import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { preflight, parseAdvertisedModels } from "./writer-route-preflight.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "writer-route-preflight.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "writer-route-preflight-"));
const only = (result) => result.verdicts.map(({ ticket, verdict }) => `${ticket}:${verdict}`).join(" ");

try {
  const retired = JSON.parse(fs.readFileSync(path.join(here, "..", ".claude", "writer-defaults.json"), "utf8")).retiredRoutes;
  for (const route of ["claude-agent", "claude-desktop", "claude-adopted"]) {
    const result = preflight({ route, model: "claude-opus-5-5", tickets: [{ number: 1, effort: "medium" }, { number: 2, effort: "high" }], evidence: { agents: ["writer-opus-5-5-medium"], coordinator: { model: "claude-opus-5-5", effort: "high" } } });
    assert.equal(only(result), "1:blocked 2:blocked", route);
    assert.equal(result.verdicts[0].reason, `${route} is retired as a dispatch route: ${retired[route]}`);
    assert.equal(result.verdicts[0].launch, undefined, "a blocked ticket names no substitute launch");
  }

  const fixture = JSON.parse(fs.readFileSync(path.join(here, "codex-app-tools.fixture.json"), "utf8"));
  const modelParameter = fixture.tools.find((tool) => tool.name === "send_message_to_thread").inputSchema.properties.model.description;
  const advertised = parseAdvertisedModels(modelParameter);
  assert.deepEqual(advertised.get("gpt-5.6-luna"), ["low", "medium", "high", "xhigh", "max"]);
  assert.equal(advertised.size, 6);
  assert.equal(only(preflight({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 8, effort: "ultra" }], evidence: { modelParameter } })), "8:available");
  assert.match(preflight({ route: "codex-app", model: "gpt-5.5", tickets: [{ number: 9, effort: "max" }], evidence: { modelParameter } }).verdicts[0].reason, /only at low, medium, high, xhigh, not max/);
  assert.match(preflight({ route: "codex-app", model: "gpt-6.1-sol", tickets: [{ number: 10, effort: "low" }], evidence: { modelParameter } }).verdicts[0].reason, /does not offer gpt-6\.1-sol/);
  assert.throws(() => preflight({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 11, effort: "low" }], evidence: { modelParameter: "no models here" } }), /lists no models/);

  const fake = path.join(tmp, "fake-codex.mjs"), calls = path.join(tmp, "calls.log");
  const levels = (...list) => list.map((effort) => ({ effort, description: "" }));
  const catalog = { models: [{ slug: "gpt-5.6-terra", supported_reasoning_levels: levels("low", "medium", "high") }, { slug: "gpt-6.1-sol", supported_reasoning_levels: levels("low") }] };
  fs.writeFileSync(fake, [
    'import fs from "node:fs";',
    `fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
    `if (process.argv[2] === "debug" && process.argv[3] === "models") { console.log(${JSON.stringify(JSON.stringify(catalog))}); process.exit(0); }`,
    'const model = process.argv[process.argv.indexOf("--model") + 1];',
    'if (model === "gpt-6.1-sol") { console.error(`ERROR: The \'${model}\' model is not supported when using Codex with a ChatGPT account.`); process.exit(1); }',
    'if (process.argv.includes(\'model_reasoning_effort="medium"\')) { console.error("ERROR: reasoning effort medium is unavailable"); process.exit(1); }',
  ].join("\n"));
  const codex = [process.execPath, fake];
  const cli = preflight({ route: "codex-cli", model: "gpt-5.6-terra", tickets: [{ number: 12, effort: "low" }, { number: 13, effort: "high" }, { number: 14, effort: "low" }, { number: 26, effort: "ultra" }, { number: 36, effort: "medium" }], evidence: { codex } });
  assert.equal(only(cli), "12:available 13:available 14:available 26:blocked 36:blocked");
  assert.match(cli.verdicts[3].reason, /catalog supports gpt-5\.6-terra only at low, medium, high, not ultra/, "an effort the launch would accept but the model does not support is blocked");
  assert.match(cli.verdicts[4].reason, /probe exited 1: ERROR: reasoning effort medium is unavailable/, "each effort is probed at that effort");
  const argv = fs.readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(argv.map((args) => args[0]), ["debug", "exec", "exec", "exec"], "one catalog read and one probe per distinct supported effort");
  for (const [index, effort] of [[1, "low"], [2, "high"], [3, "medium"]]) assert.deepEqual(argv[index].slice(0, 5), ["exec", "--model", "gpt-5.6-terra", "-c", `model_reasoning_effort="${effort}"`]);
  const refused = preflight({ route: "codex-cli", model: "gpt-6.1-sol", tickets: [{ number: 15, effort: "low" }], evidence: { codex } });
  assert.equal(only(refused), "15:blocked");
  assert.match(refused.verdicts[0].reason, /probe exited 1: ERROR: The 'gpt-6\.1-sol' model is not supported when using Codex with a ChatGPT account/);
  assert.match(preflight({ route: "codex-cli", model: "gpt-6-astra", tickets: [{ number: 27, effort: "low" }], evidence: { codex } }).verdicts[0].reason, /catalog does not list gpt-6-astra/);
  assert.match(preflight({ route: "codex-cli", model: "gpt-6-astra", tickets: [{ number: 16, effort: "low" }], evidence: { codex: path.join(tmp, "missing-codex") } }).verdicts[0].reason, /catalog could not run/);

  const fakeClaude = path.join(tmp, "fake-claude.mjs"), claudeCalls = path.join(tmp, "claude-calls.log");
  fs.writeFileSync(fakeClaude, [
    'import fs from "node:fs";',
    `fs.appendFileSync(${JSON.stringify(claudeCalls)}, JSON.stringify({ argv: process.argv.slice(2), inherited: Object.keys(process.env).filter((key) => /^CLAUDE/i.test(key)), prompt: fs.readFileSync(0, "utf8") }) + "\\n");`,
    'const arg = (flag) => process.argv[process.argv.indexOf(flag) + 1];',
    'if (arg("--effort") === "max") { console.log(JSON.stringify({ type: "result", is_error: true, result: "API Error: effort max is unavailable", modelUsage: {} })); process.exit(1); }',
    'const served = arg("--model") === "claude-fable-5-1" ? "claude-sonnet-5-5" : arg("--model");',
    'console.log(JSON.stringify({ type: "result", is_error: false, result: "ready", modelUsage: { [served]: { outputTokens: 1 } } }));',
  ].join("\n"));
  const claude = [process.execPath, fakeClaude];
  process.env.CLAUDE_EFFORT = "low";
  try {
    const cliClaude = preflight({ route: "claude-cli", model: "claude-opus-5-5", tickets: [{ number: 40, effort: "high" }, { number: 41, effort: "high" }, { number: 42, effort: "max" }], evidence: { claude } });
    assert.equal(only(cliClaude), "40:available 41:available 42:blocked");
    assert.match(cliClaude.verdicts[2].reason, /Claude CLI probe exited 1: API Error: effort max is unavailable/);
    const probes = fs.readFileSync(claudeCalls, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(probes.map((p) => p.argv.slice(0, 5)), [["-p", "--model", "claude-opus-5-5", "--effort", "high"], ["-p", "--model", "claude-opus-5-5", "--effort", "max"]], "one probe per distinct effort, at that effort");
    assert.deepEqual(probes.map((p) => p.inherited), [[], []], "the probe drops the coordinator's CLAUDE* variables");
    const substituted = preflight({ route: "claude-cli", model: "claude-fable-5-1", tickets: [{ number: 43, effort: "low" }], evidence: { claude } });
    assert.match(substituted.verdicts[0].reason, /answered with claude-sonnet-5-5, not claude-fable-5-1/, "a probe answered by another model is blocked");
    assert.match(preflight({ route: "claude-cli", model: "claude-opus-5-5", tickets: [{ number: 44, effort: "low" }], evidence: { claude: path.join(tmp, "missing-claude") } }).verdicts[0].reason, /probe could not run/);
    assert.equal(only(preflight({ route: "claude-cli", model: "claude-opus-5-5", tickets: [{ number: 45, effort: "high", observed: { model: "claude-opus-5-5", effort: "high" } }, { number: 46, effort: "high", observed: { model: "claude-opus-5-5", effort: "low" } }] })), "45:confirmed 46:blocked", "a launched CLI writer is confirmed from its own model and shell effort");
  } finally { delete process.env.CLAUDE_EFFORT; }

  const rolloutOf = (name, ...contexts) => {
    const file = path.join(tmp, name);
    fs.writeFileSync(file, [{ type: "session_meta", payload: {} }, ...contexts.map((payload) => ({ type: "turn_context", payload }))].map((row) => JSON.stringify(row)).join("\n") + "\n");
    return file;
  };
  const rollout = rolloutOf("rollout.jsonl", { model: "gpt-6-astra", effort: "medium" }, { model: "gpt-6-astra", effort: "high" });
  const confirmed = preflight({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 17, effort: "high", observed: { rollout } }, { number: 18, effort: "medium", observed: { rollout } }], evidence: { modelParameter } });
  assert.equal(only(confirmed), "17:confirmed 18:blocked", "the latest turn_context row is current");
  assert.match(confirmed.verdicts[1].reason, /runs gpt-6-astra at high, not gpt-6-astra at medium/);
  assert.equal(only(preflight({ route: "claude-desktop", model: "claude-opus-5-5", tickets: [{ number: 19, effort: "medium", observed: { model: "claude-opus-5-5", effort: "medium" } }, { number: 20, effort: "medium", observed: { model: "claude-sonnet-5-5", effort: "medium" } }] })), "19:confirmed 20:blocked");
  const active = path.join(tmp, "active.jsonl");
  fs.writeFileSync(active, fs.readFileSync(rollout, "utf8") + '{"type":"event_msg","payload":');
  assert.equal(only(preflight({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 37, effort: "high", observed: { rollout: active } }], evidence: { modelParameter } })), "37:confirmed");
  const unfinishedContext = path.join(tmp, "unfinished.jsonl");
  fs.writeFileSync(unfinishedContext, fs.readFileSync(rollout, "utf8") + JSON.stringify({ type: "turn_context", payload: { model: "gpt-6-astra", effort: "low" } }));
  assert.equal(only(preflight({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 38, effort: "high", observed: { rollout: unfinishedContext } }], evidence: { modelParameter } })), "38:confirmed", "a context row without its newline is not yet a record");

  fs.writeFileSync(calls, "");
  const unsupported = preflight({ route: "codex-cli", model: "gpt-5.6-terra", tickets: [{ number: 28, effort: "ultra", observed: { rollout: rolloutOf("ultra.jsonl", { model: "gpt-5.6-terra", effort: "ultra" }) } }, { number: 29, effort: "high", observed: { rollout: rolloutOf("high.jsonl", { model: "gpt-5.6-terra", effort: "high" }) } }], evidence: { codex } });
  assert.equal(only(unsupported), "28:blocked 29:confirmed");
  assert.match(unsupported.verdicts[0].reason, /catalog supports gpt-5\.6-terra only at low, medium, high, not ultra/);
  assert.deepEqual(fs.readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line)[0]), ["debug"], "confirmation reads the catalog and launches nothing");
  const appUnsupported = preflight({ route: "codex-app", model: "gpt-5.5", tickets: [{ number: 30, effort: "max", observed: { model: "gpt-5.5", effort: "max" } }], evidence: { modelParameter } });
  assert.match(appUnsupported.verdicts[0].reason, /only at low, medium, high, xhigh, not max/);
  assert.throws(() => preflight({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 31, effort: "high", observed: { rollout } }] }), /evidence\.modelParameter/);

  for (const observed of [{}, null, [], { model: "gpt-5.6-terra" }, { rollout: "relative.jsonl" }, { rollout: rolloutOf("bare.jsonl", { model: "gpt-5.6-terra" }) }]) {
    fs.writeFileSync(calls, "");
    assert.throws(() => preflight({ route: "codex-cli", model: "gpt-5.6-terra", tickets: [{ number: 32, effort: "low" }, { number: 33, effort: "low", observed }], evidence: { codex } }), /Ticket 33 |needs a model and an effort/, JSON.stringify(observed));
    assert.equal(fs.readFileSync(calls, "utf8"), "", `no catalog read or probe for ${JSON.stringify(observed)}`);
  }

  assert.throws(() => preflight({ route: "claude-agent", model: "gpt-6-astra", tickets: [{ number: 21, effort: "low" }] }), /claude model id/);
  assert.throws(() => preflight({ route: "claude-agent", model: "claude-opus-5-5", tickets: [{ number: 22, effort: "ultra" }] }), /effort must be one of/);
  assert.throws(() => preflight({ route: "claude-cli", model: "gpt-6-astra", tickets: [{ number: 39, effort: "low" }] }), /claude model id/);
  assert.throws(() => preflight({ route: "codex-exec", model: "gpt-6-astra", tickets: [{ number: 23, effort: "low" }] }), /route must be one of/);
  assert.throws(() => preflight({ route: "claude-agent", model: "claude-opus-5-5", tickets: [] }), /at least one/);

  const run = (request) => {
    const file = path.join(tmp, "request.json");
    fs.writeFileSync(file, JSON.stringify(request));
    return spawnSync(process.execPath, [script, file], { encoding: "utf8", windowsHide: true });
  };
  const ok = run({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 24, effort: "ultra" }], evidence: { modelParameter } });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).verdicts[0].verdict, "available");
  const blocked = run({ route: "claude-agent", model: "claude-opus-5-5", tickets: [{ number: 25, effort: "max" }] });
  assert.equal(blocked.status, 1);
  assert.equal(JSON.parse(blocked.stdout).verdicts[0].verdict, "blocked");
  const malformed = run({ route: "claude-agent" });
  assert.equal(malformed.status, 2);
  assert.match(malformed.stderr, /model must be/);
  const emptyObservation = run({ route: "claude-desktop", model: "claude-opus-5-5", tickets: [{ number: 1479, effort: "medium", observed: {} }] });
  assert.equal(emptyObservation.status, 2, "an empty observation is a malformed request, not a blocked route");
  assert.match(emptyObservation.stderr, /Ticket 1479 observed needs a model and an effort/);
  assert.equal(spawnSync(process.execPath, [script, "request.json"], { encoding: "utf8", windowsHide: true }).status, 2, "a relative request path is refused");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log("writer-route-preflight checks passed");
