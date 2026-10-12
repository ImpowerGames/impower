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
  // Agent tool: a pinned writer definition at exactly that model and effort.
  const agent = preflight({ route: "claude-agent", model: "claude-opus-5-5", tickets: [{ number: 1, effort: "medium" }, { number: 2, effort: "xhigh" }] });
  assert.equal(only(agent), "1:available 2:blocked");
  assert.deepEqual(agent.verdicts[0].launch, { subagent_type: "writer-opus-5-5-medium" });
  assert.match(agent.verdicts[1].reason, /no writer definition .* claude-opus-5-5 at xhigh/);
  assert.equal(agent.verdicts[1].launch, undefined, "a blocked ticket names no substitute launch");

  // Desktop session: the coordinator's own model at or below its own effort.
  const coordinator = { model: "claude-opus-5-5", effort: "high" };
  assert.equal(only(preflight({ route: "claude-desktop", model: "claude-opus-5-5", tickets: [{ number: 3, effort: "low" }, { number: 4, effort: "high" }, { number: 5, effort: "max" }], evidence: { coordinator } })), "3:available 4:available 5:blocked");
  const otherModel = preflight({ route: "claude-desktop", model: "claude-sonnet-5-5", tickets: [{ number: 6, effort: "low" }], evidence: { coordinator } });
  assert.match(otherModel.verdicts[0].reason, /coordinator runs claude-opus-5-5/);
  assert.throws(() => preflight({ route: "claude-desktop", model: "claude-opus-5-5", tickets: [{ number: 7, effort: "low" }] }), /evidence\.coordinator/);

  // App collaboration: the host's advertised models and efforts, read from the
  // model parameter description of the captured host fixture.
  const fixture = JSON.parse(fs.readFileSync(path.join(here, "codex-app-tools.fixture.json"), "utf8"));
  const modelParameter = fixture.tools.find((tool) => tool.name === "send_message_to_thread").inputSchema.properties.model.description;
  const advertised = parseAdvertisedModels(modelParameter);
  assert.deepEqual(advertised.get("gpt-5.6-luna"), ["low", "medium", "high", "xhigh", "max"]);
  assert.equal(advertised.size, 6);
  assert.equal(only(preflight({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 8, effort: "ultra" }], evidence: { modelParameter } })), "8:available");
  assert.match(preflight({ route: "codex-app", model: "gpt-5.5", tickets: [{ number: 9, effort: "max" }], evidence: { modelParameter } }).verdicts[0].reason, /only at low, medium, high, xhigh, not max/);
  assert.match(preflight({ route: "codex-app", model: "gpt-6.1-sol", tickets: [{ number: 10, effort: "low" }], evidence: { modelParameter } }).verdicts[0].reason, /does not offer gpt-6\.1-sol/);
  assert.throws(() => preflight({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 11, effort: "low" }], evidence: { modelParameter: "no models here" } }), /lists no models/);

  // CLI: the model catalog must list the effort, and a probe launch with the
  // exact model and effort must succeed, once per effort. The stand-in
  // accepts any effort at launch, as the real CLI does, and refuses
  // gpt-6.1-sol the way a ChatGPT account does although its catalog lists it.
  const fake = path.join(tmp, "fake-codex.mjs"), calls = path.join(tmp, "calls.log");
  const levels = (...list) => list.map((effort) => ({ effort, description: "" }));
  const catalog = { models: [{ slug: "gpt-5.6-terra", supported_reasoning_levels: levels("low", "medium", "high") }, { slug: "gpt-6.1-sol", supported_reasoning_levels: levels("low") }] };
  fs.writeFileSync(fake, [
    'import fs from "node:fs";',
    `fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
    `if (process.argv[2] === "debug" && process.argv[3] === "models") { console.log(${JSON.stringify(JSON.stringify(catalog))}); process.exit(0); }`,
    'const model = process.argv[process.argv.indexOf("--model") + 1];',
    'if (model === "gpt-6.1-sol") { console.error(`ERROR: The \'${model}\' model is not supported when using Codex with a ChatGPT account.`); process.exit(1); }',
  ].join("\n"));
  const codex = [process.execPath, fake];
  const cli = preflight({ route: "codex-cli", model: "gpt-5.6-terra", tickets: [{ number: 12, effort: "low" }, { number: 13, effort: "high" }, { number: 14, effort: "low" }, { number: 26, effort: "ultra" }], evidence: { codex } });
  assert.equal(only(cli), "12:available 13:available 14:available 26:blocked");
  assert.match(cli.verdicts[3].reason, /catalog supports gpt-5\.6-terra only at low, medium, high, not ultra/, "an effort the launch would accept but the model does not support is blocked");
  const argv = fs.readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(argv.map((args) => args[0]), ["debug", "exec", "exec"], "one catalog read and one probe per distinct supported effort");
  assert.deepEqual(argv[1].slice(0, 5), ["exec", "--model", "gpt-5.6-terra", "-c", 'model_reasoning_effort="low"']);
  const refused = preflight({ route: "codex-cli", model: "gpt-6.1-sol", tickets: [{ number: 15, effort: "low" }], evidence: { codex } });
  assert.equal(only(refused), "15:blocked");
  assert.match(refused.verdicts[0].reason, /probe exited 1: ERROR: The 'gpt-6\.1-sol' model is not supported when using Codex with a ChatGPT account/);
  assert.match(preflight({ route: "codex-cli", model: "gpt-6-astra", tickets: [{ number: 27, effort: "low" }], evidence: { codex } }).verdicts[0].reason, /catalog does not list gpt-6-astra/);
  assert.match(preflight({ route: "codex-cli", model: "gpt-6-astra", tickets: [{ number: 16, effort: "low" }], evidence: { codex: path.join(tmp, "missing-codex") } }).verdicts[0].reason, /catalog could not run/);

  // After launch: the writer's own metadata or rollout confirms the route. A
  // Claude session's metadata needs no pre-launch evidence.
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

  // A Codex rollout records an unsupported effort unchanged, so a matching
  // observation is still checked against the host's supported efforts: the
  // CLI catalog (without a paid probe) or the app's advertised list.
  fs.writeFileSync(calls, "");
  const unsupported = preflight({ route: "codex-cli", model: "gpt-5.6-terra", tickets: [{ number: 28, effort: "ultra", observed: { rollout: rolloutOf("ultra.jsonl", { model: "gpt-5.6-terra", effort: "ultra" }) } }, { number: 29, effort: "high", observed: { rollout: rolloutOf("high.jsonl", { model: "gpt-5.6-terra", effort: "high" }) } }], evidence: { codex } });
  assert.equal(only(unsupported), "28:blocked 29:confirmed");
  assert.match(unsupported.verdicts[0].reason, /catalog supports gpt-5\.6-terra only at low, medium, high, not ultra/);
  assert.deepEqual(fs.readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line)[0]), ["debug"], "confirmation reads the catalog and launches nothing");
  const appUnsupported = preflight({ route: "codex-app", model: "gpt-5.5", tickets: [{ number: 30, effort: "max", observed: { model: "gpt-5.5", effort: "max" } }], evidence: { modelParameter } });
  assert.match(appUnsupported.verdicts[0].reason, /only at low, medium, high, xhigh, not max/);
  assert.throws(() => preflight({ route: "codex-app", model: "gpt-6-astra", tickets: [{ number: 31, effort: "high", observed: { rollout } }] }), /evidence\.modelParameter/);

  // Malformed observations are refused, before any probe runs.
  for (const observed of [{}, null, [], { model: "claude-opus-5-5" }, { rollout: "relative.jsonl" }, { rollout: rolloutOf("bare.jsonl", { model: "gpt-6-astra" }) }]) {
    assert.throws(() => preflight({ route: "codex-cli", model: "gpt-6-astra", tickets: [{ number: 32, effort: "low" }, { number: 33, effort: "low", observed }], evidence: { codex: path.join(tmp, "missing-codex") } }), /Ticket 33 |needs a model and an effort/, JSON.stringify(observed));
  }

  // Malformed requests are refused rather than judged.
  assert.throws(() => preflight({ route: "claude-agent", model: "gpt-6-astra", tickets: [{ number: 21, effort: "low" }] }), /claude model id/);
  assert.throws(() => preflight({ route: "claude-agent", model: "claude-opus-5-5", tickets: [{ number: 22, effort: "ultra" }] }), /effort must be one of/);
  assert.throws(() => preflight({ route: "codex-exec", model: "gpt-6-astra", tickets: [{ number: 23, effort: "low" }] }), /route must be one of/);
  assert.throws(() => preflight({ route: "claude-agent", model: "claude-opus-5-5", tickets: [] }), /at least one/);

  // The command line prints the verdicts and exits 0 when every ticket can
  // run, 1 when any is blocked and 2 for a malformed request.
  const run = (request) => {
    const file = path.join(tmp, "request.json");
    fs.writeFileSync(file, JSON.stringify(request));
    return spawnSync(process.execPath, [script, file], { encoding: "utf8", windowsHide: true });
  };
  const ok = run({ route: "claude-agent", model: "claude-opus-5-5", tickets: [{ number: 24, effort: "low" }] });
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
