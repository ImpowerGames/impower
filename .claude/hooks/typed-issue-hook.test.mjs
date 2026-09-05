// Exercises the typed-issue hook two ways: the decision table runs against
// decide() directly, and a handful of cases run through the literal
// PreToolUse "command" string that .claude/settings.json ships, with
// CLAUDE_PROJECT_DIR set, so the wiring is covered as well as the logic. Run:
//   node .claude/hooks/typed-issue-hook.test.mjs

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decide } from "./typed-issue-hook.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;

function check(ok, label, detail) {
  if (ok) console.log(`PASS: ${label}`);
  else {
    failed++;
    console.log(`FAIL: ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

const denies = [
  ["plain gh issue create", 'gh issue create --title "x" --body-file ticket.md --label "system: sparkdown"'],
  ["gh issue create after a cd", 'cd "C:/Users/dev/scratch" && gh issue create --title "x" --body-file ticket.md'],
  ["gh issue create with the subcommand in mixed case", "gh Issue Create --title x"],
  ["gh issue create through a full path", "/usr/bin/gh issue create --title x"],
  ["gh issue create through a quoted gh.exe path", '& "C:\\Program Files\\GitHub CLI\\gh.exe" issue create --title x'],
  ["gh issue create through an unquoted Windows path", "C:\\tools\\gh.exe issue create --title x"],
  ["gh issue create on this repo by --repo", "gh issue create -R ImpowerGames/impower --title x"],
  ["gh issue create on this repo by URL", "gh issue create --repo https://github.com/ImpowerGames/impower --title x"],
  ["gh issue create inside bash -c", 'bash -c "gh issue create --title x"'],
  ["gh issue create inside eval", "eval 'gh issue create --title x'"],
  ["gh issue create after a pipe", "cat ticket.md | gh issue create --title x --body-file -"],
  ["gh issue create in a command substitution", 'N=$(gh issue create --title x --body-file t.md); echo $N'],
  ["untyped create, unquoted endpoint", 'gh api -X POST repos/ImpowerGames/impower/issues -f title="x" -F body=@ticket.md'],
  ["untyped create, quoted endpoint", 'gh api -X POST "repos/ImpowerGames/impower/issues" -f title="x"'],
  ["untyped create, endpoint last", "gh api --method POST -f title=x repos/ImpowerGames/impower/issues"],
  ["untyped create, --method=POST with a query string", "gh api --method=POST repos/ImpowerGames/impower/issues?foo=1 -f title=x"],
  ["untyped create, -XPOST", "gh api -XPOST /repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create, lowercase post", "gh api -X post repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create, quoted method", 'gh api -X "POST" repos/ImpowerGames/impower/issues -f title=x'],
  ["untyped create, single-quoted method", "gh api -X 'POST' repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create, double-spaced method", "gh api -X  POST repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create, implicit POST from -f", 'gh api repos/ImpowerGames/impower/issues -f title="x" -F body=@ticket.md'],
  ["untyped create, implicit POST from --field", "gh api repos/ImpowerGames/impower/issues --field title=x"],
  ["untyped create, implicit POST from --raw-field=", "gh api repos/ImpowerGames/impower/issues --raw-field=title=x"],
  ["untyped create, multi-line command", "gh api --method POST -f title=x repos/ImpowerGames/impower/issues\necho done"],
  ["untyped create, line continuation", "gh api -X POST repos/ImpowerGames/impower/issues \\\n  -f title=x"],
  ["untyped create, {owner}/{repo} placeholders", "gh api repos/{owner}/{repo}/issues -f title=x"],
  ["untyped create, uppercase repo", "gh api repos/IMPOWERGAMES/IMPOWER/issues -f title=x"],
  ["untyped create, trailing slash on endpoint", "gh api -X POST repos/ImpowerGames/impower/issues/ -f title=x"],
  ["type= only in the title", 'gh api -X POST repos/ImpowerGames/impower/issues -f title="fix: content-type= header dropped"'],
  ["type= only in the body", 'gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f body="repro: set type=foo"'],
  ["Type= is not the type field", "gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f Type=Bug"],
  ["empty type value", "gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f type="],
  ["create from --input, no method", "gh api --input ticket.json repos/ImpowerGames/impower/issues"],
  ["create from --input with -X POST", "gh api -X POST repos/ImpowerGames/impower/issues --input ticket.json"],
  ["create from --input with a type field alongside (goes to the query string)", "gh api repos/ImpowerGames/impower/issues --input t.json -f type=Bug"],
  ["GraphQL createIssue", "gh api graphql -f query='mutation { createIssue(input: {repositoryId: \"x\", title: \"y\"}) { issue { id } } }'"],
  ["curl POST to the collection", 'curl -X POST -H "Authorization: token x" https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x"}\''],
  ["curl with --data and no method", 'curl https://api.github.com/repos/ImpowerGames/impower/issues --data \'{"title":"x"}\''],
];

const allows = [
  ["typed create", 'gh api -X POST repos/ImpowerGames/impower/issues -f title="x" -F body=@ticket.md -f type=Task -f "labels[]=workflow: ci"'],
  ["typed create with --field", "gh api --method POST repos/ImpowerGames/impower/issues --field title=x --field type=Bug"],
  ["typed create, type quoted", 'gh api -X POST repos/ImpowerGames/impower/issues -f "type=Feature" -f title=x'],
  ["typed create, implicit POST", "gh api repos/ImpowerGames/impower/issues -f title=x -f type=Bug -F body=@ticket.md"],
  ["typed create, --raw-field=type=", "gh api repos/ImpowerGames/impower/issues --raw-field=title=x --raw-field=type=Task"],
  ["typed create, multi-line with --jq", "gh api -X POST repos/ImpowerGames/impower/issues \\\n  -f title=x -f type=Bug \\\n  --jq '{number, url: .html_url, type: .type.name}'"],
  ["typed create from the recipe, run through a cd", 'cd "$S" && gh api -X POST repos/ImpowerGames/impower/issues -f title="t" -F body=@ticket.md -f type=Task -f "labels[]=workflow: skill" --jq \'{number, url: .html_url, type: .type.name}\''],
  ["reading an issue", "gh issue view 443 --json title,body,labels"],
  ["editing an issue", "gh issue edit 443 --body-file ticket.md"],
  ["listing issues", 'gh issue list --label "workflow: ci"'],
  ["issue create in another repo", "gh issue create -R other/repo --title x"],
  ["issue create in another repo, --repo=", "gh issue create --repo=other/repo --title x"],
  ["GET on the issues collection", "gh api repos/ImpowerGames/impower/issues?state=open"],
  ["GET on the issues collection with an explicit method and fields", "gh api -X GET repos/ImpowerGames/impower/issues -f state=open"],
  ["paginated GET", "gh api --paginate repos/ImpowerGames/impower/issues --jq '.[].number'"],
  ["PATCH on one issue", "gh api -X PATCH repos/ImpowerGames/impower/issues/443 -f type=Task"],
  ["POST of a comment on one issue", "gh api -X POST repos/ImpowerGames/impower/issues/443/comments -f body=hi"],
  ["implicit POST of a comment on one issue", "gh api repos/{owner}/{repo}/issues/123/comments -f body='Hi from CLI'"],
  ["POST of labels on one issue", 'gh api -X POST repos/ImpowerGames/impower/issues/443/labels -f "labels[]=bug"'],
  ["untyped create in another repo", "gh api -X POST repos/SomeOther/repo/issues -f title=x -f body=y"],
  ["POST to an endpoint that only ends in /issues by name", "gh api -X POST repos/ImpowerGames/impower/import/issues -f title=x"],
  ["GraphQL query", "gh api graphql -f query='query { repository(owner: \"a\", name: \"b\") { issues(first: 5) { nodes { title } } } }'"],
  ["pull request create", 'gh pr create --draft --title "x" --body-file pr-body.md'],
  ["pull request comment", "gh pr comment 444 --body-file review.md"],
  ["commit message that mentions the phrase", 'git commit -m "docs: stop telling agents to use gh issue create"'],
  ["pr comment that mentions the phrase", 'gh pr comment 445 --body "the hook refuses gh issue create now"'],
  ["grep for the phrase", 'grep -rn "gh issue create" .claude'],
  ["pr create whose title mentions the phrase", 'gh pr create --title "ci(github): stop using gh issue create" --body-file pr-body.md'],
  ["a GET and a comment POST in one command", 'gh api repos/ImpowerGames/impower/issues --paginate --jq ".[].number" && gh api -X POST repos/ImpowerGames/impower/issues/443/comments -F body=@note.md'],
  ["comment body that names the collection", 'gh api -X POST repos/ImpowerGames/impower/issues/445/comments -f body="the hook guards repos/O/R/issues and refuses untyped creates"'],
  ["multi-line command with a typed create and a view", "gh api repos/ImpowerGames/impower/issues -f title=x -f type=Bug\ngh issue view 443"],
  ["echo of the recipe", 'echo "gh api -X POST repos/ImpowerGames/impower/issues -f title=x"'],
  ["curl GET on the collection", "curl https://api.github.com/repos/ImpowerGames/impower/issues?state=open"],
  ["curl typed create", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x","type":"Bug"}\''],
  ["unrelated command", "npm run web:dev"],
  ["empty command", ""],
];

for (const [label, command] of denies) {
  const reason = decide(command);
  check(typeof reason === "string" && reason.includes("type=Bug"), `denied: ${label}`, `got ${JSON.stringify(reason)}`);
}
for (const [label, command] of allows) {
  const reason = decide(command);
  check(reason === null, `allowed: ${label}`, `got ${JSON.stringify(reason)}`);
}

// The description field must not influence the decision.
{
  const settings = JSON.parse(readFileSync(resolve(root, ".claude", "settings.json"), "utf8"));
  const entry = (settings.hooks?.PreToolUse ?? []).find(
    (e) => /\bBash\b/.test(e.matcher) && /\bPowerShell\b/.test(e.matcher),
  );
  const hook = entry?.hooks.find((h) => h.command.includes("typed-issue-hook.mjs"));
  check(Boolean(hook), "settings.json wires typed-issue-hook.mjs for Bash|PowerShell");
  if (hook) {
    const run = (payload) =>
      spawnSync("bash", ["-c", hook.command], {
        input: payload,
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      });
    const wire = (label, payload, expectDeny) => {
      const r = run(payload);
      const out = r.stdout ?? "";
      let parsed = null;
      try {
        parsed = out ? JSON.parse(out) : null;
      } catch {}
      const denied = parsed?.hookSpecificOutput?.permissionDecision === "deny";
      const ok = r.status === 0 && !(r.stderr ?? "").trim() && denied === expectDeny && (expectDeny ? typeof parsed.hookSpecificOutput.permissionDecisionReason === "string" : out === "");
      check(ok, `${expectDeny ? "wired deny" : "wired allow"}: ${label}`, `status=${r.status} stderr=${JSON.stringify(r.stderr)} stdout=${JSON.stringify(out)}`);
    };
    const payload = (tool_name, tool_input) => JSON.stringify({ tool_name, tool_input });
    wire("Bash gh issue create", payload("Bash", { command: "gh issue create --title x", description: "file it" }), true);
    wire("PowerShell untyped implicit POST", payload("PowerShell", { command: "gh api repos/ImpowerGames/impower/issues -f title=x" }), true);
    wire("Bash typed create", payload("Bash", { command: "gh api repos/ImpowerGames/impower/issues -f title=x -f type=Bug" }), false);
    wire("phrase only in the description", payload("Bash", { command: "npm test", description: "check nothing still runs gh issue create" }), false);
    wire("payload without tool_input", payload("Bash", undefined), false);
    wire("unparseable payload mentioning gh api", "{not json gh api repos/x/y/issues", true);
    wire("unparseable payload without gh", "{not json", false);
    wire("deny reason survives a percent sign", payload("Bash", { command: "gh issue create --title '100%'" }), true);
  }
}

if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("all checks passed");
