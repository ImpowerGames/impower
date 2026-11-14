import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRepos, ticketsRepo } from "../repos.mjs";
import { fetchAnswer, listRequests, recordBody } from "../skills/ask-maintainer/maintainer-request.mjs";
import { noteRequests, openRequestIndex, requestIndexDir } from "../skills/ask-maintainer/request-index.mjs";
import { citedRequests, decisionClaim } from "./maintainer-request-hook.mjs";
import { decide } from "./policy.mjs";
import { normalize } from "./pre-tool-use.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repos = readRepos();
const repo = ticketsRepo(repos);
const scratch = mkdtempSync(path.join(tmpdir(), "maintainer-request-hook-"));
const indexRoot = path.join(scratch, "index");
const missingRoot = path.join(scratch, "no-index");
process.env.IMPOWER_MAINTAINER_REQUEST_INDEX = indexRoot;

const REQUEST = 2285;
const ANSWERED = 3001;
const OTHER = 4242;
noteRequests(repo, [
  { number: REQUEST, kind: "decision", state: "waiting" },
  { number: ANSWERED, kind: "decision", state: "answered" },
]);

const wrapper = path.join(root, ".claude/hooks/maintainer-request-hook.mjs");
const runs = [
  ["Claude Code Bash", (command, cwd, env) => claudeHook("Bash", command, cwd, env)],
  ["Claude Code PowerShell", (command, cwd, env) => claudeHook("PowerShell", command, cwd, env)],
  ["Codex", (command, cwd, env) => withEnv(env, () => decide(normalize({ session_id: "guard-test", tool_name: "Bash", tool_input: { command }, cwd }, "codex")))],
];

function claudeHook(tool, command, cwd, env) {
  const result = spawnSync(process.execPath, [wrapper], { input: JSON.stringify({ session_id: "guard-test", tool_name: tool, tool_input: { command }, cwd }), encoding: "utf8", windowsHide: true, env: { ...process.env, ...env } });
  assert.equal(result.status, 0, result.stderr);
  if (!result.stdout) return null;
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.deepEqual([output.hookEventName, output.permissionDecision], ["PreToolUse", "deny"], `the Claude Code hook denies, not merely explains: ${result.stdout}`);
  return output.permissionDecisionReason;
}

function withEnv(env, work) {
  const saved = process.env.IMPOWER_MAINTAINER_REQUEST_INDEX;
  if (env?.IMPOWER_MAINTAINER_REQUEST_INDEX) process.env.IMPOWER_MAINTAINER_REQUEST_INDEX = env.IMPOWER_MAINTAINER_REQUEST_INDEX;
  try {
    return work();
  } finally {
    process.env.IMPOWER_MAINTAINER_REQUEST_INDEX = saved;
  }
}

const TOOL = "node .agents/skills/ask-maintainer/maintainer-request.mjs";
const touching = (n) => [
  ["gh issue comment", `gh issue comment ${n} -R ${repo} --body "Here is the screenshot you asked for."`],
  ["gh issue close", `gh issue close ${n} --repo ${repo} --reason "not planned"`],
  ["gh issue edit", `gh issue edit ${n} -R ${repo} --add-label "maintainer: decided without you"`],
  ["gh issue reopen", `gh issue reopen ${n} -R ${repo}`],
  ["gh issue comment by address", `gh issue comment https://github.com/${repo}/issues/${n} --body-file reply.md`],
  ["gh issue close under GH_REPO", `GH_REPO=${repo} gh issue close ${n}`],
  ["the REST comment call", `gh api -X POST repos/${repo}/issues/${n}/comments -f body="B"`],
  ["the REST comment call by fields alone", `gh api repos/${repo}/issues/${n}/comments -f body=B`],
  ["the REST update call", `gh api -X PATCH repos/${repo}/issues/${n} -f state=closed -f state_reason=completed`],
  ["the REST label call", `gh api --method POST repos/${repo}/issues/${n}/labels -f "labels[]=maintainer: task"`],
  ["a curl update", `curl -X PATCH -H "Authorization: Bearer x" https://api.github.com/repos/${repo}/issues/${n} -d '{"state":"closed"}'`],
  ["a nested shell", `bash -c "gh issue comment ${n} -R ${repo} --body ok"`],
  ["gh issue close by address under another -R", `gh issue close https://github.com/${repo}/issues/${n} -R acme/other`],
  ["gh issue comment under a host-qualified -R", `gh issue comment ${n} -R github.com/${repo} --body ok`],
  ["gh issue close under a repository address", `gh issue close ${n} --repo https://github.com/${repo}.git`],
  ["gh issue edit naming the request after another issue", `gh issue edit 4243 ${n} -R ${repo} --add-label x`],
  ["a curl data call with --request", `curl --request PATCH --data '{"state":"closed"}' https://api.github.com/repos/${repo}/issues/${n}`],
  ["Invoke-RestMethod with an -InFile body", `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${n}/comments -Method Post -InFile body.json`],
  ["Invoke-RestMethod by position with a body", `Invoke-RestMethod https://api.github.com/repos/${repo}/issues/${n}/comments -Method Post -Body '{"body":"ok"}'`],
  ["Invoke-RestMethod with -CustomMethod", `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${n}/labels -CustomMethod DELETE`],
  ["Invoke-WebRequest with headers", `Invoke-WebRequest -Uri https://api.github.com/repos/${repo}/issues/${n} -Method Patch -Headers $h -ContentType application/json -Body '{"state":"closed"}'`],
];
const unmodelled = (n) => [
  ["a gh api short-option cluster", `gh api -iX DELETE repos/${repo}/issues/${n}/labels`],
  ["a gh api attached method", `gh api -XPATCH repos/${repo}/issues/${n} -f state=closed`],
  ["a gh api attached field", `gh api -X POST repos/${repo}/issues/${n}/comments -fbody="The maintainer approved it."`],
  ["a gh api with two methods", `gh api -X GET --method PATCH repos/${repo}/issues/${n} -f state=closed`],
  ["a gh issue attached repository", `gh issue close ${n} -R${repo}`],
  ["a gh issue short-option cluster", `gh issue comment ${n} -R ${repo} -wb "ok"`],
  ["a curl short-option cluster", `curl -sX DELETE https://api.github.com/repos/${repo}/issues/${n}/labels`],
  ["a curl data cluster", `curl -sd '{"body":"ok"}' https://api.github.com/repos/${repo}/issues/${n}/comments`],
  ["a curl --next batch", `curl https://api.github.com/repos/acme/other/issues/1 --next -X PATCH https://api.github.com/repos/${repo}/issues/${n} -d '{"state":"closed"}'`],
  ["a curl --next batch from a foreign host", `curl -d 'status=ok' https://example.test/telemetry --next https://api.github.com/repos/${repo}/issues/${n}`],
  ["a curl call with two URLs", `curl -X PATCH https://api.github.com/repos/${repo}/issues/${n} https://api.github.com/repos/${repo}/issues/1 -d '{"state":"closed"}'`],
  ["Invoke-RestMethod with colon parameters", `Invoke-RestMethod -Uri:https://api.github.com/repos/${repo}/issues/${n} -Method:Patch -Body:'{"state":"closed"}'`],
  ["Invoke-RestMethod with abbreviated parameters", `irm -Ur https://api.github.com/repos/${repo}/issues/${n} -Me Patch -B '{"state":"closed"}'`],
  ["Invoke-WebRequest with -CM", `Invoke-WebRequest -Uri https://api.github.com/repos/${repo}/issues/${n}/labels -CM DELETE`],
  ["a curl upload", `curl -T body.json https://api.github.com/repos/${repo}/issues/${n}`],
  ["a curl --upload-file post", `curl -X POST -H "Content-Type: application/json" --upload-file claim.json https://api.github.com/repos/${repo}/issues/${n}/comments`],
  ["a curl config file", `curl --config change.cfg https://api.github.com/repos/${repo}/issues/${n}`],
  ["a curl short config", `curl -K change.cfg https://api.github.com/repos/${repo}/issues/${n}`],
  ["a curl request target override", `curl -X DELETE --request-target /repos/${repo}/issues/${n}/labels https://api.github.com/repos/${repo}/issues/1/labels`],
  ["a curl form", `curl -X POST -F "body=@claim.md" https://api.github.com/repos/${repo}/issues/${n}/comments`],
  ["a curl variable expansion", `curl -X PATCH --variable s=closed --expand-data '{"state":"{{s}}"}' https://api.github.com/repos/${repo}/issues/${n}`],
  ["a changing curl call with an unknown option", `curl -X PATCH --retry-all-errors https://api.github.com/repos/${repo}/issues/${n} -d '{"state":"closed"}'`],
  ["a changing gh api call with an unknown option", `gh api -X PATCH --method-override repos/${repo}/issues/${n} -f state=closed`],
  ["Invoke-RestMethod with a form", `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${n}/comments -Method Post -Form $f`],
  ["a changing Invoke-RestMethod with an unread parameter", `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${n} -Method Patch -WebSession $s -Body '{"state":"closed"}'`],
  ["Invoke-WebRequest with a colon InFile", `Invoke-WebRequest -Uri https://api.github.com/repos/${repo}/issues/${n}/comments -Method Post -InFile:body.json`],
];

for (const [harness, run] of runs) {
  for (const [label, command] of touching(REQUEST)) {
    const reason = run(command, scratch);
    assert.match(reason ?? "", new RegExp(`${repo}#${REQUEST} is a maintainer request, and only the ask-maintainer tool`), `${harness}: ${label} on a request is refused`);
    assert.match(reason, /maintainer-request\.mjs (revise|withdraw|read)/, `${harness}: ${label}'s refusal names the tool command`);
  }
  for (const [label, command] of touching(OTHER)) assert.equal(run(command, scratch), null, `${harness}: ${label} on an issue that is not a request passes`);
  for (const n of [REQUEST, OTHER]) for (const [label, command] of unmodelled(n)) {
    const reason = run(command, scratch);
    assert.match(reason ?? "", new RegExp(`changes or publishes to ${repo} in a form the maintainer request guard does not model`), `${harness}: ${label} on #${n} is refused as unmodelled`);
    assert.match(reason, /Use the plain form, for example: (gh|curl|Invoke-RestMethod) /, `${harness}: ${label}'s refusal names the plain form`);
  }
  for (const command of [
    `${TOOL} revise ${REQUEST} request.json what-changed.md`,
    `${TOOL} withdraw ${REQUEST} "Nothing waits on it any more"`,
    `${TOOL} record ${REQUEST}`,
    `gh issue view ${REQUEST} -R ${repo} --json state`,
    `gh api repos/${repo}/issues/${REQUEST}/comments --paginate --slurp`,
    `gh api repos/${repo}/issues/${REQUEST}/timeline`,
    `gh issue view ${OTHER} -R ${repo} --comments`,
    `gh issue list -R ${repo} --label "maintainer: decision" --state open`,
    `gh issue comment ${OTHER} -R ${repo} --body-file reply.md`,
    `gh issue edit ${OTHER} -R ${repo} --add-label "workflow: skills" --title "New title"`,
    `gh issue create -R ${repo} --type Task --title "Follow-up" --body-file reply.md`,
    `gh api -i repos/${repo}/issues/${OTHER} --jq .state`,
    `gh api -X GET repos/${repo}/issues -f state=open -f per_page=100`,
    `curl -sS -H "Authorization: Bearer x" https://api.github.com/repos/${repo}/issues/${REQUEST}`,
    `curl -s -G https://api.github.com/repos/${repo}/issues/${REQUEST}/comments -d per_page=100`,
    `curl -sS -X GET https://api.github.com/repos/${repo}/issues/${REQUEST}/comments`,
    `curl --retry-delay 2 -X HEAD https://api.github.com/repos/${repo}/issues/${REQUEST}`,
    `gh api -X GET -i repos/${repo}/issues/${REQUEST}/comments -f per_page=100`,
    `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${REQUEST} -Method Get -WebSession $s`,
    `irm -Ur https://api.github.com/repos/${repo}/issues/${REQUEST}`,
    `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${REQUEST}/comments -Body @{per_page=1}`,
    `gh pr create --draft -dt "Guards" -b ok`,
    `curl -sX POST https://api.github.com/repos/acme/other/issues/1/comments -d '{"body":"ok"}'`,
    `Invoke-RestMethod -Uri https://example.test/repos/${repo}/issues/${REQUEST} -Method Patch -Body '{"state":"closed"}'`,
  ]) assert.equal(run(command, scratch), null, `${harness}: ${command} passes`);
  console.log(`ok: ${harness} refuses gh issue comment, close, edit and reopen and the REST comment and update calls on an indexed request, refuses unmodelled forms aimed at the tickets repository, and passes ordinary ticket commands, reads, other repositories and the tool`);
}

assert.match(touching(REQUEST)[0][1], /--body/);
const closeReason = runs[0][1](touching(REQUEST)[1][1], scratch);
assert.match(closeReason, new RegExp(`withdraw ${REQUEST} <reason>`), "a close names withdraw");
assert.match(runs[0][1](touching(REQUEST)[0][1], scratch), new RegExp(`revise ${REQUEST} <request\\.json>`), "a comment names revise");

const phrases = [
  "The maintainer decided to keep the phone preview strip.",
  "The maintainer approved the hollow pin.",
  "The maintainer agreed to drop the strip.",
  "The maintainer chose option B.",
  "The maintainer accepted the recommendation.",
  "The maintainer confirmed the two-column layout.",
  "Per the maintainer, the strip goes.",
  "This follows the maintainer's decision on the strip.",
  "Approved by the maintainer on 2026-11-13.",
  `${repos.maintainer.login} approved this layout.`,
  "The maintainer has explicitly approved the new route icon.",
];
const bodyDir = path.join(scratch, "bodies");
mkdirSync(bodyDir);
const file = (name, text) => {
  writeFileSync(path.join(bodyDir, name), text);
  return name;
};
for (const [harness, run] of runs) {
  phrases.forEach((phrase, k) => {
    const inline = `gh issue comment ${OTHER} -R ${repo} --body "${phrase}"`;
    assert.match(run(inline, bodyDir) ?? "", /claims a maintainer decision .* and cites no answered maintainer request/, `${harness}: inline "${phrase}" with no request is refused`);
    const viaFile = `gh issue comment ${OTHER} -R ${repo} --body-file ${file(`claim-${k}.md`, `Status.\n\n${phrase}\n`)}`;
    assert.match(run(viaFile, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: "${phrase}" in a body file is refused`);
    const cited = `gh issue comment ${OTHER} -R ${repo} --body-file ${file(`cited-${k}.md`, `${phrase} Recorded on #${ANSWERED}.\n`)}`;
    assert.equal(run(cited, bodyDir), null, `${harness}: "${phrase}" citing an answered request passes`);
    const unanswered = `gh issue comment ${OTHER} -R ${repo} --body "${phrase} See #${REQUEST}."`;
    assert.match(run(unanswered, bodyDir) ?? "", new RegExp(`#${REQUEST} as waiting`), `${harness}: "${phrase}" citing an unanswered request is refused with its state`);
    const quoted = `gh issue comment ${OTHER} -R ${repo} --body-file ${file(`quoted-${k}.md`, `The old ticket said:\n\n> ${phrase}\n\nand the record also said "${phrase.replace(/"/g, "")}" without a quote of the maintainer.\n`)}`;
    assert.equal(run(quoted, bodyDir), null, `${harness}: "${phrase}" inside a quotation passes`);
  });
  for (const command of [
    `gh pr create --draft --title "Guards" --body-file ${file("pr.md", "The maintainer chose B.\n")}`,
    `gh api -X POST repos/${repo}/issues/${OTHER}/comments -f body="The maintainer approved it."`,
    `gh api -X POST repos/${repo}/issues/${OTHER}/comments -F body=@${file("api.md", "Per the maintainer, ship it.\n")}`,
    `gh issue create -R ${repo} --type Task --title "Follow-up" --body "The maintainer decided this."`,
    `gh issue comment ${OTHER} -R ${repo} --body-file - <<'EOF'\nThe maintainer accepted the fallback.\nEOF`,
  ]) assert.match(run(command, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: ${command.split("\n")[0]} is refused`);
  mkdirSync(path.join(bodyDir, "sub"), { recursive: true });
  writeFileSync(path.join(bodyDir, "sub", "claim.md"), "The maintainer approved the new layout.\n");
  writeFileSync(path.join(bodyDir, "sub", "status.md"), "Status update.\n");
  writeFileSync(path.join(bodyDir, "status.md"), "The maintainer approved the new layout.\n");
  writeFileSync(path.join(bodyDir, "sub", "plain.md"), "Status update.\n");
  writeFileSync(path.join(bodyDir, "plain.md"), "Another status update.\n");
  const subClaim = path.join(bodyDir, "sub", "claim.md").replaceAll(path.sep, "/");
  const changed = [
    `cd sub; gh issue comment ${OTHER} -R ${repo} --body-file claim.md`,
    `cd sub && gh issue comment ${OTHER} -R ${repo} --body-file claim.md`,
    `Set-Location sub; gh issue comment ${OTHER} -R ${repo} --body-file claim.md`,
    `cd "${path.join(bodyDir, "sub").replaceAll(path.sep, "/")}"; gh issue comment ${OTHER} -R ${repo} --body-file claim.md`,
    `bash -c "cd sub && gh issue comment ${OTHER} -R ${repo} --body-file claim.md"`,
  ];
  if (process.platform === "win32") changed.push(`gh issue comment ${OTHER} -R ${repo} --body-file ${subClaim.replace(/^([A-Za-z]):/, (m, drive) => `/${drive.toLowerCase()}`)}`);
  for (const command of changed) assert.match(run(command, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: ${command} reads the body file where the shell will`);
  for (const command of [
    `(cd sub); gh issue comment ${OTHER} -R ${repo} --body-file status.md`,
    `cd sub | cat; gh issue comment ${OTHER} -R ${repo} --body-file status.md`,
  ]) assert.match(run(command, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: ${command} checks the parent directory's file a subshell or pipeline leaves in place`);
  assert.equal(run(`cd sub; gh issue comment ${OTHER} -R ${repo} --body-file plain.md`, bodyDir), null, `${harness}: a harmless file in every candidate directory passes`);
  for (const command of [
    `cd sub; printf "%s" "$(gh issue comment ${OTHER} -R ${repo} --body-file claim.md)"`,
    `cd sub; echo $(gh issue comment ${OTHER} -R ${repo} --body-file claim.md)`,
  ]) assert.match(run(command, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: ${command} reads the body file from the directories the substitution may run in`);
  for (const command of [
    `curl https://api.github.com/repos/${repo}/issues/${OTHER}/comments --json '{"body":' --json '"The maintainer approved it."}'`,
    `curl https://api.github.com/repos/${repo}/issues/${OTHER}/comments -d 'title=Status' -d 'body=The maintainer approved it.'`,
    `curl https://api.github.com/repos/${repo}/issues/${OTHER}/comments --data-binary '{"body": "The maintainer approved it.",'`,
  ]) assert.match(run(command, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: ${command} is refused`);
  const payloadClaim = file("infile.json", JSON.stringify({ body: "The maintainer approved the new layout." }));
  for (const command of [
    `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${OTHER}/comments -Method Post -ContentType application/json -InFile ${payloadClaim}`,
    `Invoke-WebRequest -Uri https://api.github.com/repos/${repo}/issues/${OTHER}/comments -Method Post -InFile ${payloadClaim}`,
  ]) assert.match(run(command, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: ${command} reads the -InFile body`);
  writeFileSync(path.join(bodyDir, "head.json"), '{"body":"Status ');
  writeFileSync(path.join(bodyDir, "tail.json"), 'update."}');
  writeFileSync(path.join(bodyDir, "sub", "head.json"), '{"body":"The maintainer ');
  writeFileSync(path.join(bodyDir, "sub", "tail.json"), 'approved it."}');
  assert.match(run(`cd sub; curl https://api.github.com/repos/${repo}/issues/${OTHER}/comments --json @head.json --json @tail.json`, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: split curl body files are assembled per candidate directory`);
  assert.equal(run(`curl https://api.github.com/repos/${repo}/issues/${OTHER}/comments --json @head.json --json @tail.json`, bodyDir), null, `${harness}: split harmless curl body files pass`);
  for (const command of [
    `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${REQUEST}/comments -Body @{per_page=1}`,
    `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${OTHER}/comments -Body '{"body":"The maintainer approved it."}'`,
  ]) assert.equal(run(command, bodyDir), null, `${harness}: ${command} is a PowerShell GET and passes`);
  for (const command of [
    `pushd sub; popd; gh issue comment ${OTHER} -R ${repo} --body-file status.md`,
    `Push-Location sub; Pop-Location; gh issue comment ${OTHER} -R ${repo} --body-file status.md`,
  ]) assert.match(run(command, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: ${command} reads the file in the restored directory`);
  assert.match(run(`pushd sub; gh issue comment ${OTHER} -R ${repo} --body-file status.md`, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: inside pushd both candidate directories are checked`);
  for (const command of [
    `curl -X POST -d 'body=The maintainer approved the layout.' https://api.github.com/repos/${repo}/issues/${OTHER}/comments`,
    `Invoke-RestMethod -Uri https://api.github.com/repos/${repo}/issues/${OTHER}/comments -Method Post -Body '{"body":"The maintainer approved the layout."}'`,
  ]) assert.match(run(command, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: ${command} is refused`);
  for (const command of [
    `curl -sd 'body=The maintainer approved the layout.' https://api.github.com/repos/${repo}/issues/${OTHER}/comments`,
    `curl https://example.test/ping --next -d '{"body":"The maintainer approved the layout."}' https://api.github.com/repos/${repo}/issues/${OTHER}/comments`,
    `Invoke-RestMethod -Uri:https://api.github.com/repos/${repo}/issues/${OTHER}/comments -Method:Post -Body:'{"body":"The maintainer approved the layout."}'`,
  ]) assert.match(run(command, bodyDir) ?? "", /does not model/, `${harness}: ${command} is refused as unmodelled before its text is read`);
  const json = file("payload.json", JSON.stringify({ body: "The maintainer approved the layout." }));
  const citedJson = file("payload-cited.json", JSON.stringify({ body: `The maintainer approved the layout, recorded on #${ANSWERED}.` }));
  for (const command of [
    `gh api -X POST repos/${repo}/issues/${OTHER}/comments --input ${json}`,
    `curl -X POST https://api.github.com/repos/${repo}/issues/${OTHER}/comments --json @${json}`,
    `curl -X POST https://api.github.com/repos/${repo}/issues/${OTHER}/comments -d '{"body":"The maintainer approved the layout."}'`,
    `gh api -X POST repos/${repo}/issues/${OTHER}/comments --input - <<'EOF'\n{"body":"The maintainer approved the layout."}\nEOF`,
    `gh pr edit 2746 -R ImpowerGames/impower --body "The maintainer chose B. See #${ANSWERED}."`,
    `gh issue comment ${OTHER} -R ${repo} --body "The maintainer chose B. See someone-else/impower-internal#${ANSWERED}."`,
    `gh issue comment ${OTHER} -R ${repo} --body "The maintainer chose B. See impower-internal#${ANSWERED}."`,
  ]) assert.match(run(command, bodyDir) ?? "", /claims a maintainer decision/, `${harness}: ${command.split("\n")[0]} is refused`);
  for (const command of [
    `gh api -X POST repos/${repo}/issues/${OTHER}/comments --input ${citedJson}`,
    `gh pr edit 2746 -R ImpowerGames/impower --body "The maintainer chose B. See ${repo}#${ANSWERED}."`,
    `gh pr edit 2746 -R ImpowerGames/impower --body "The maintainer chose B (I-${ANSWERED})."`,
    `gh pr edit 2746 -R ImpowerGames/impower --body "The maintainer chose B: https://github.com/${repo}/issues/${ANSWERED}"`,
    `curl -X POST https://example.test/telemetry --data-raw 'The maintainer approved the layout.'`,
    `curl -X POST https://api.github.com/repos/${repo}/issues/${OTHER}/comments -d '{"body":"Status update.","note":"the maintainer approved"}'`,
  ]) assert.equal(run(command, bodyDir), null, `${harness}: ${command} passes`);
  for (const text of [
    "The maintainer has not decided yet; the request is open.",
    "Decided by fallback, not reviewed by the maintainer: B went ahead at 17:37.",
    "Ask the maintainer whether they approved the earlier layout.",
    "Accepted: finding F1 is real and fixed in abc1234.",
    "Filed a maintainer decision request for the gutter mark.",
  ]) assert.equal(run(`gh issue comment ${OTHER} -R ${repo} --body "${text}"`, bodyDir), null, `${harness}: "${text}" passes`);
  console.log(`ok: ${harness} refuses each decision phrase inline and in a body file without an answered request, and passes it when cited, quoted or hedged`);
}

{
  const issue = { number: ANSWERED, html_url: `https://github.com/${repo}/issues/${ANSWERED}` };
  const record = recordBody({ number: issue.number, url: issue.html_url, kind: "decision", tagged: false, question: "What should mark a choice the preview picked by itself?", state: "accepted", closed: { at: "2026-11-13T16:10:00Z" }, shown: { at: "2026-11-13T15:00:00Z", revised: false, options: 5, pictures: 6 }, recommended: { letter: "B", name: "A hollow pin" }, words: [] });
  assert.match(record, /accepted the recommendation/);
  for (const [harness, run] of runs) {
    assert.equal(run(`gh issue comment 2271 -R ${repo} --body-file ${file("record.md", record)}`, bodyDir), null, `${harness}: the tool's record passes`);
    const inlineRecord = `gh issue comment 2271 -R ${repo} --body-file ${file("record-claim.md", `${record}\nThe maintainer accepted B.\n`)}`;
    assert.equal(run(inlineRecord, bodyDir), null, `${harness}: text carrying the tool's record cites its answered request`);
  }
  console.log("ok: the tool's own record, which cites its answered request, passes");
}

for (const [harness, run] of runs) {
  const env = { IMPOWER_MAINTAINER_REQUEST_INDEX: missingRoot };
  const touch = run(touching(OTHER)[0][1], scratch, env);
  assert.match(touch ?? "", /maintainer request guard cannot check this command because the maintainer request index at .* cannot be read \(it does not exist yet\)/, `${harness}: a missing index refuses a comment`);
  assert.match(touch, /maintainer-request\.mjs list/, `${harness}: the refusal names list`);
  const claim = run(`gh issue comment ${OTHER} -R ${repo} --body "The maintainer chose B on #${ANSWERED}."`, scratch, env);
  assert.match(claim ?? "", /cannot be read/, `${harness}: a missing index refuses a cited claim`);
  assert.equal(run(`gh issue view ${OTHER} -R ${repo}`, scratch, env), null, `${harness}: a read needs no index`);
  console.log(`ok: ${harness} fails closed with a message when the index cannot be read`);
}

{
  const broken = path.join(scratch, "broken");
  const dir = requestIndexDir(repo, { IMPOWER_MAINTAINER_REQUEST_INDEX: broken });
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${OTHER}.json`), "{ not json");
  writeFileSync(path.join(dir, `${ANSWERED}.json`), JSON.stringify({ number: ANSWERED, state: "decided-somehow" }));
  for (const [harness, run] of runs) {
    const env = { IMPOWER_MAINTAINER_REQUEST_INDEX: broken };
    assert.match(run(touching(OTHER)[0][1], scratch, env) ?? "", /index entry .* cannot be read/, `${harness}: an unreadable entry refuses`);
    assert.match(run(`gh issue comment 7 -R ${repo} --body "Per the maintainer, B. See #${ANSWERED}."`, scratch, env) ?? "", /is malformed/, `${harness}: a malformed entry refuses a cited claim`);
  }
  console.log("ok: an unreadable or malformed index entry fails closed");
}

{
  assert.equal(decisionClaim("Status: the maintainer's request is open.", "someone"), null);
  assert.equal(decisionClaim("```\nthe maintainer approved\n```", "someone"), null);
  assert.equal(decisionClaim("`the maintainer approved`", "someone"), null);
  assert.deepEqual(citedRequests(`See #12, I-34, ${repo}#56 and https://github.com/${repo}/issues/78; not &#90;.`, repos).sort((a, b) => a - b), [12, 34, 56, 78]);
  assert.deepEqual(citedRequests(`See #12, I-34, other/${repo}#56 and acme/${repo.split("/")[1]}#57.`, repos, "ImpowerGames/impower"), [34], "in another repository a bare number and foreign references cite nothing");
  console.log("ok: claims ignore code and hedges, and citations read #N, the autolink prefix, owner/name#N and issue addresses");
}

{
  const fake = path.join(scratch, "tool-index");
  const saved = process.env.IMPOWER_MAINTAINER_REQUEST_INDEX;
  process.env.IMPOWER_MAINTAINER_REQUEST_INDEX = fake;
  try {
    const labels = repos.maintainer.labels;
    const listed = [
      { number: 10, title: "Q? (#1)", state: "open", body: "", created_at: "2026-11-13T10:00:00Z", html_url: "u10" },
      { number: 11, title: "Q? (#2)", state: "closed", body: "", created_at: "2026-11-12T10:00:00Z", html_url: "u11" },
    ];
    const tracker = { repo: "acme/tickets", all: (label) => (label === labels.decision ? listed : label === labels.task ? [{ number: 12, title: "Do (#3)", state: "open", body: "", created_at: "2026-11-13T11:00:00Z", html_url: "u12" }] : []), open: () => [] };
    const groups = listRequests(tracker, repos);
    assert.deepEqual([groups.decisions.map((i) => i.number), groups.tasks.map((i) => i.number)], [[10], [12]], "list shows only open requests");
    const index = openRequestIndex("acme/tickets");
    assert.deepEqual([10, 11, 12].map((n) => index.entry(n)?.state), ["open", "closed", "open"], "list indexes open and closed requests");
    assert.deepEqual(readdirSync(requestIndexDir("acme/tickets")).sort(), ["10.json", "11.json", "12.json"]);
    noteRequests("acme/tickets", [{ number: 11, kind: "decision", state: "answered" }, { number: 12, kind: "task", tagged: true, state: "waiting" }, { number: 14, kind: "task", tagged: true, state: "waiting" }]);
    listRequests(tracker, repos);
    assert.equal(openRequestIndex("acme/tickets").entry(11).state, "answered", "a later list keeps a recorded answer");
    assert.deepEqual([openRequestIndex("acme/tickets").entry(12)?.tagged, openRequestIndex("acme/tickets").entry(14)], [true, null], "list forgets a tagged ticket whose task label was removed and keeps one still labelled");
    process.env.IMPOWER_MAINTAINER_REQUEST_INDEX = path.join(scratch, "cold-index");
    const filedTask = { number: 15, title: "Draw (#3)", state: "open", body: readFileSync(path.join(root, ".agents/skills/ask-maintainer/fixtures/task-body.md"), "utf8"), created_at: "2026-11-13T11:00:00Z", html_url: "u15" };
    const taggedTicket = { number: 16, title: "Draw the title art", state: "open", body: "An ordinary ticket body.", created_at: "2026-11-13T11:00:00Z", html_url: "u16" };
    let labelled = [filedTask, taggedTicket];
    const cold = { repo: "acme/tickets", all: (label) => (label === labels.task ? labelled : []), open: () => [] };
    listRequests(cold, repos);
    assert.deepEqual([15, 16].map((n) => openRequestIndex("acme/tickets").entry(n)?.tagged), [false, true], "a list on an empty index tells a filed task request from a tagged ticket by its body");
    labelled = [filedTask];
    listRequests(cold, repos);
    assert.deepEqual([openRequestIndex("acme/tickets").entry(15)?.state, openRequestIndex("acme/tickets").entry(16)], ["open", null], "after a rebuild, removing a ticket's task label still releases it");
    const body = readFileSync(path.join(root, ".agents/skills/ask-maintainer/fixtures/decision-body.md"), "utf8");
    const issue = { number: 20, title: "What should mark it? (#2271)", body, state: "closed", state_reason: "completed", closed_at: "2026-11-13T16:10:00Z", closed_by: { login: repos.maintainer.login }, html_url: "u20" };
    const answerTracker = { repo: "acme/tickets", issue: () => issue, timeline: () => [{ event: "closed", created_at: issue.closed_at, actor: { login: repos.maintainer.login } }] };
    assert.equal(fetchAnswer(20, { tracker: answerTracker, repos }).state, "accepted");
    assert.equal(openRequestIndex("acme/tickets").entry(20).state, "accepted", "reading an answer indexes it");
  } finally {
    process.env.IMPOWER_MAINTAINER_REQUEST_INDEX = saved;
  }
  console.log("ok: the tool's list and read keep the index current");
}

rmSync(scratch, { recursive: true, force: true });
