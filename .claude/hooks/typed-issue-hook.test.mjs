// Exercises the typed-issue hook two ways: the decision table runs against
// decide() directly, and a set of payloads run through the literal
// PreToolUse "command" string that .claude/settings.json ships, under bash
// and, when one is installed, under dash as a plain POSIX shell, with
// CLAUDE_PROJECT_DIR set, so the wiring is covered as well as the logic.
// Both positions of the cutover switch in .agents/repos.json are covered:
// the original tables pin the off position, and the public-repository guard
// table runs the hook script with the switch on, from fixture checkouts that
// carry their own repos file. Run:
//   node .claude/hooks/typed-issue-hook.test.mjs

import { testShell } from "../../.agents/skills/drive-web-editor/redgreen.mjs";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readRepos, ticketsRepo } from "../../.agents/repos.mjs";
import { decide as decideWith } from "./typed-issue-hook.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OFF = { ...readRepos(), cutover: false };
const ON = { ...readRepos(), cutover: true };
const decide = (command, shell) => decideWith(command, shell, { repos: OFF });
let failed = 0;

// A checkout holding only the hook, its re-export and a repos file, so the
// hook can run as the harness runs it with either position of the switch
// without touching the committed file.
const scratch = mkdtempSync(join(tmpdir(), "typed-issue-hook-"));
function fixture(name, reposText) {
  const dir = join(scratch, name);
  for (const file of [".claude/hooks/typed-issue-hook.mjs", ".agents/hooks/typed-issue-hook.mjs", ".agents/repos.mjs"]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    copyFileSync(join(root, file), join(dir, file));
  }
  writeFileSync(join(dir, ".agents/repos.json"), reposText);
  return dir;
}
const fixtures = {
  off: fixture("off", JSON.stringify(OFF)),
  on: fixture("on", JSON.stringify(ON)),
  broken: fixture("broken", JSON.stringify({ ...OFF, cutover: "yes" })),
};

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
  ["gh issue create through uppercase GH.EXE", "C:\\tools\\GH.EXE issue create --title x"],
  ["gh issue create on this repo by --repo", "gh issue create -R ImpowerGames/impower --title x"],
  ["gh issue create on this repo by -R=", "gh issue create -R=ImpowerGames/impower --title x"],
  ["gh issue create on this repo by URL", "gh issue create --repo https://github.com/ImpowerGames/impower --title x"],
  ["gh issue create on this repo by .git URL", "gh issue create --repo https://github.com/ImpowerGames/impower.git --title x"],
  ["gh issue create with -R before the subcommand", "gh -R ImpowerGames/impower issue create --title x --body-file t.md"],
  ["gh issue create with -R between issue and create", "gh issue -R ImpowerGames/impower create --title x"],
  ["gh issue create with --repo before the subcommand", "gh --repo ImpowerGames/impower issue create --title x"],
  ["gh issue create whose title starts with -R", 'gh issue create --title "-R other/repo bug in the parser"'],
  ["gh issue create after an environment assignment", "GH_TOKEN=x gh issue create --title x"],
  ["gh issue create through sudo", "sudo gh issue create --title x"],
  ["gh issue create through xargs", "echo x | xargs gh issue create --title"],
  ["gh issue create inside bash -c", 'bash -c "gh issue create --title x"'],
  ["gh issue create inside bash -lc", "bash -lc 'gh issue create --title x'"],
  ["gh issue create inside sh -euc", "sh -euc 'gh issue create --title x'"],
  ["gh issue create inside pwsh -Command", 'pwsh -Command "gh issue create --title x"'],
  ["gh issue create inside eval", "eval 'gh issue create --title x'"],
  ["gh issue create after a pipe", "cat ticket.md | gh issue create --title x --body-file -"],
  ["gh issue create in a command substitution", 'N=$(gh issue create --title x --body-file t.md); echo $N'],
  ["gh issue create after a here-doc that writes the ticket", "cat > t.md <<'EOF'\n## Summary\nEOF\ngh issue create --title x --body-file t.md"],
  ["untyped create, unquoted endpoint", 'gh api -X POST repos/ImpowerGames/impower/issues -f title="x" -F body=@ticket.md'],
  ["untyped create, quoted endpoint", 'gh api -X POST "repos/ImpowerGames/impower/issues" -f title="x"'],
  ["untyped create, endpoint last", "gh api --method POST -f title=x repos/ImpowerGames/impower/issues"],
  ["untyped create, --method=POST with a query string", "gh api --method=POST repos/ImpowerGames/impower/issues?foo=1 -f title=x"],
  ["untyped create, -XPOST", "gh api -XPOST /repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create, -X=POST", "gh api -X=POST repos/ImpowerGames/impower/issues -f title=x -F body=@t.md"],
  ["untyped create, lowercase post", "gh api -X post repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create, quoted method", 'gh api -X "POST" repos/ImpowerGames/impower/issues -f title=x'],
  ["untyped create, single-quoted method", "gh api -X 'POST' repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create, double-spaced method", "gh api -X  POST repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create, implicit POST from -f", 'gh api repos/ImpowerGames/impower/issues -f title="x" -F body=@ticket.md'],
  ["untyped create, implicit POST from --field", "gh api repos/ImpowerGames/impower/issues --field title=x"],
  ["untyped create, implicit POST from --raw-field=", "gh api repos/ImpowerGames/impower/issues --raw-field=title=x"],
  ["untyped create, absolute URL endpoint", "gh api https://api.github.com/repos/ImpowerGames/impower/issues -f title=x -F body=@t.md"],
  ["untyped create, absolute URL endpoint with -X POST", "gh api -X POST https://api.github.com/repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create with -R before api", "gh -R ImpowerGames/impower api repos/ImpowerGames/impower/issues -f title=x"],
  ["untyped create, multi-line command", "gh api --method POST -f title=x repos/ImpowerGames/impower/issues\necho done"],
  ["untyped create, line continuation", "gh api -X POST repos/ImpowerGames/impower/issues \\\n  -f title=x"],
  ["untyped create, PowerShell backtick continuation", "gh api -X POST repos/ImpowerGames/impower/issues `\n  -f title=x"],
  ["untyped create, {owner}/{repo} placeholders", "gh api repos/{owner}/{repo}/issues -f title=x"],
  ["untyped create, uppercase repo", "gh api repos/IMPOWERGAMES/IMPOWER/issues -f title=x"],
  ["untyped create, trailing slash on endpoint", "gh api -X POST repos/ImpowerGames/impower/issues/ -f title=x"],
  ["type= only in the title", 'gh api -X POST repos/ImpowerGames/impower/issues -f title="fix: content-type= header dropped"'],
  ["type= only in the body", 'gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f body="repro: set type=foo"'],
  ["type= only in the --jq filter", "gh api repos/ImpowerGames/impower/issues -f title=x --jq '.type=null'"],
  ["Type= is not the type field", "gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f Type=Bug"],
  ["empty type value", "gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f type="],
  ["-F type=null sends JSON null", "gh api repos/ImpowerGames/impower/issues -f title=x -F type=null"],
  ["-F type=false sends JSON false", "gh api repos/ImpowerGames/impower/issues -f title=x -F type=false"],
  ["create from --input, no method", "gh api --input ticket.json repos/ImpowerGames/impower/issues"],
  ["create from --input with -X POST", "gh api -X POST repos/ImpowerGames/impower/issues --input ticket.json"],
  ["create from --input with a type field alongside (goes to the query string)", "gh api repos/ImpowerGames/impower/issues --input t.json -f type=Bug"],
  ["GraphQL createIssue", "gh api graphql -f query='mutation { createIssue(input: {repositoryId: \"x\", title: \"y\"}) { issue { id } } }'"],
  ["curl POST to the collection", 'curl -X POST -H "Authorization: token x" https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x"}\''],
  ["curl with --data and no method", 'curl https://api.github.com/repos/ImpowerGames/impower/issues --data \'{"title":"x"}\''],
  ["curl behind an environment prefix", 'GH_TOKEN=t curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x"}\''],
  ["Invoke-RestMethod POST to the collection", "Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $b -Headers $h"],
  ["irm with a body", "irm https://api.github.com/repos/ImpowerGames/impower/issues -Body '{\"title\":\"x\"}'"],
  ["Invoke-RestMethod with -ContentType", "Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -ContentType 'application/json' -Body $b"],
  ["iwr with -ContentType", 'iwr https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body $b -ContentType "application/json"'],
  ["curl with an attached -d@file", "curl -d@t.json https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl with an attached -d body", "curl -d'{\"title\":\"x\"}' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl with --data-urlencode", "curl --data-urlencode title=x https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl with -XPOST joined", "curl -XPOST https://api.github.com/repos/ImpowerGames/impower/issues -H 'Content-Type: application/json' --data-binary @t.json"],
  ["here-doc with CRLF line endings, then a create", "cat > t.md <<'EOF'\r\n## Summary\r\nEOF\r\ngh issue create --title x"],
  ["here-doc with a glued redirect, then a create", "cat <<EOF>out.txt\nbody\nEOF\ngh issue create --title x"],
  ["a stray << that is not a here-doc, then a create", "echo $((1 << 2))\ngh issue create --title x"],
  ["quoted environment value before the create", 'GH_TOKEN="abc" gh issue create --title x'],
  ["single-quoted environment value before the create", "GH_TOKEN='abc' gh issue create --title x"],
  ["quoted environment value before an untyped api create", 'GH_HOST="github.com" gh api repos/ImpowerGames/impower/issues -f title=x -F body=@t.md'],
  ["xargs with a quoted -I placeholder", "cat titles.txt | xargs -I '{}' gh issue create --title '{}'"],
  ["xargs with a bare -I placeholder", "xargs -I {} gh issue create --title {}"],
  ["create inside a for loop", "for i in 1 2; do gh issue create --title x; done"],
  ["untyped api create inside a for loop", "for f in a b; do gh api repos/ImpowerGames/impower/issues -f title=$f; done"],
  ["create inside a while loop", "while read t; do gh issue create --title $t; done < titles.txt"],
  ["untyped api create inside an if", "if [ -f t.md ]; then gh api repos/ImpowerGames/impower/issues -f title=x -F body=@t.md; fi"],
  ["curl create inside a for loop", "for i in 1; do curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d '{\"title\":\"x\"}'; done"],
  ["create inside a brace group", "{ gh issue create --title x; }"],
  ["create inside a PowerShell % loop", "1..3 | % { gh issue create --title x }"],
  ["create inside ForEach-Object", "ForEach-Object { gh issue create --title x }"],
  ["create through sudo -u", "sudo -u me gh issue create --title x"],
  ["create through env -u", "env -u GH_TOKEN gh issue create --title x"],
  ["create through timeout", "timeout 30 gh issue create --title x"],
  ["create through stdbuf", "stdbuf -o0 gh issue create --title x"],
  ["create in a backquote substitution after an assignment", "N=`gh issue create --title x`; echo $N"],
  ["create in a backquote substitution glued to an assignment value", "x=y`gh issue create --title x`"],
  ["-F type=@file cannot be read", "gh api repos/ImpowerGames/impower/issues -f title=x -F type=@t.txt"],
  ["create inside pwsh -NoProfile -Command", "pwsh -NoProfile -Command 'gh issue create --title x'"],
  ["create inside powershell with two options before -Command", 'powershell -NoProfile -ExecutionPolicy Bypass -Command "gh issue create --title x"'],
  ["create inside cmd /s /c", 'cmd /s /c "gh issue create --title x"'],
  ["create inside bash --login -c", "bash --login -c 'gh issue create --title x'"],
  ["create inside bash -o errexit -c", "bash -o errexit -c 'gh issue create --title x'"],
  ["create inside bash -l -c", "bash -l -c 'gh issue create --title x'"],
  ["create inside sudo bash -c", "sudo bash -c 'gh issue create --title x'"],
  ["create inside /bin/bash -c", "/bin/bash -c 'gh issue create --title x'"],
  ["create inside env -S", "env -S 'gh issue create --title x'"],
  ["create fed to bash by a here-string", "bash <<<'gh issue create --title x'"],
  ["create in a $( ) inside double quotes", 'N="$(gh issue create --title x --body-file t.md)"'],
  ["untyped api create in a $( ) inside double quotes", 'URL="$(gh api repos/ImpowerGames/impower/issues -f title=x)"'],
  ["curl create in a $( ) inside double quotes", 'R="$(curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d @t.json)"'],
  ["create in a backquote inside double quotes", 'N="`gh issue create --title x`"', "bash"],
  ["create in a $( ) inside an echo string", 'echo "created $(gh issue create --title x)"'],
  ["create after a leading redirection", ">out.txt gh issue create --title x"],
  ["create after a leading stderr redirection", "2>/dev/null gh issue create --title x"],
  ["create in a PowerShell glued call operator", "&{gh issue create --title x}"],
  ["two Invoke-RestMethod calls, the second untyped", "Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body '{\"title\":\"a\",\"type\":\"Bug\"}'; Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body '{\"title\":\"b\"}'"],
  ["Invoke-RestMethod with a quoted Content-Type header key", "Invoke-RestMethod -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Headers @{'Content-Type'='application/json'} -Body $b"],
  ["Invoke-RestMethod with a header hashtable defined earlier", "$h = @{'Content-Type'='application/json'}; Invoke-RestMethod -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $b -Headers $h"],
  ["Invoke-RestMethod with a $type variable defined earlier", "$type = 'Bug'\nirm https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body $b"],
  ["Invoke-RestMethod with type only in a trailing comment", "Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $b # remember type: Bug"],
  ["curl with a capitalised Type key", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"Type":"Bug","title":"x"}\''],
  ["curl with type only in the query string", "curl -X POST 'https://api.github.com/repos/ImpowerGames/impower/issues?type=Bug' -d '{\"title\":\"x\"}'"],
  ["curl with 'content type:' in the title", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"the content type: is wrong"}\''],
  ["curl with 'mime-type:' in the title", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"mime-type: wrong"}\''],
  ["curl with 'sub_type=' in the title", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"sub_type=x"}\''],
  ["curl with clustered -sd", "curl -sd '{\"title\":\"x\"}' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl with clustered -sfd @file", "curl -sfd @ticket.json https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl with --data-ascii", "curl --data-ascii @t.json https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl with --form-string", "curl --form-string 'title=x' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["create after a PowerShell newline escape in a string", 'Write-Host "hello`nworld"; gh issue create --title x'],
  ["create after a PowerShell tab escape in a string", 'Write-Output "a`tb"; gh issue create --title x'],
  ["untyped api create after a PowerShell percent escape", 'Write-Host "50`% done"; gh api repos/ImpowerGames/impower/issues -f title=x'],
  ["create after a Windows path with a backtick-b in a string", 'Write-Host "C:\\a`b"; gh issue create --title x'],
  ["create after a leading 2>&1", "2>&1 gh issue create --title x"],
  ["create after a leading >&2", ">&2 gh issue create --title x"],
  ["create after nohup 2>&1", "nohup 2>&1 gh issue create --title x"],
  ["create after a leading &>file", "&>out.txt gh issue create --title x"],
  ["PowerShell capture of a create", "$out = gh issue create --title x"],
  ["PowerShell glued capture of a create", "$out=gh issue create --title x"],
  ["PowerShell capture of an untyped api create", "$json = gh api repos/ImpowerGames/impower/issues -f title=x"],
  ["PowerShell capture of an untyped Invoke-RestMethod", "$r = Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $b"],
  ["pwsh with a quoted option value before -Command", "pwsh -ExecutionPolicy 'Bypass' -Command 'gh issue create --title x'"],
  ["bash with a quoted option value before -c", "bash -o 'errexit' -c 'gh issue create --title x'"],
  ["powershell with nine options before -Command", "powershell -NoProfile -NonInteractive -NoLogo -ExecutionPolicy Bypass -WindowStyle Hidden -Sta -Command 'gh issue create --title x'"],
  ["curl with 'the field type = wrong' in the title", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"the field type = wrong"}\''],
  ["curl with 'the type= is wrong' in the title", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"the type= is wrong"}\''],
  ["curl with type= in an Accept header", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -H 'Accept: application/json; type=x' -d '{\"title\":\"y\"}'"],
  ["Invoke-RestMethod with type= in a header hashtable", "Invoke-RestMethod -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body $b -Headers @{Accept='v3; type=x'}"],
  ["Invoke-RestMethod with a $( ) body that has no type", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $(@{title='x'} | ConvertTo-Json)"],
  ["Invoke-RestMethod with a parenthesised body before -Uri", "Invoke-RestMethod -Method Post -Body (@{title='x'} | ConvertTo-Json) -Uri https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["irm with a $( ) body before -Uri", "irm -Method Post -Body $(@{title='x'} | ConvertTo-Json) -Uri https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["irm with an untyped here-string body", 'irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @"\n{"title":"x"}\n"@'],
  ["create after a spaced &> redirection", "&> out.txt gh issue create --title x"],
  ["create after a >& redirection", ">& out.txt gh issue create --title x"],
  ["create after a glued &>> redirection", "&>>log.txt gh issue create --title x"],
  ["create after nohup &> out.txt", "nohup &> out.txt gh issue create --title x"],
  ["create after 2>&-", "2>&- gh issue create --title x"],
  ["curl with '(type=Bug)' in a body string", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x","body":"the call needs the field (type=Bug)"}\''],
  ["curl with ', type=Bug,' in a body string", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x","body":"add it, type=Bug, to the call"}\''],
  ["curl with 'x, type=y' in the title", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"parser drops x, type=y is ignored"}\''],
  ["curl with '(type=Task)' in the title", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"support (type=Task) syntax"}\''],
  ["curl with a nested type key only", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x","labels":[{"type":"x"}]}\''],
  ["curl with an empty type", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x","type":""}\''],
  ["Invoke-RestMethod with '(type=Bug)' in a hashtable body string", "Invoke-RestMethod -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{title='x'; body='needs (type=Bug)'} | ConvertTo-Json)"],
  ["curl with a trailing bare -X", "curl https://api.github.com/repos/ImpowerGames/impower/issues -d '{\"title\":\"x\"}' -X"],
  ["curl with an empty --request=", "curl --request= https://api.github.com/repos/ImpowerGames/impower/issues -d '{\"title\":\"x\"}'"],
  ["create inside sh -f -c", "sh -f -c 'gh issue create --title x'"],
  ["PowerShell capture with =gh glued to the operator", "$x =gh issue create --title x"],
  ["PowerShell += capture of a create", "$out += gh issue create --title x"],
  ["PowerShell ${x} capture of a create", "${x} = gh issue create --title x"],
  ["create in a backquote inside double quotes holding an inner quote", 'N="`gh issue create --title "x"`"', "bash"],
  ["create in a $( ) after a short flag", "echo -n $(gh issue create --title x)"],
  ["create in a parenthesised group after a short flag", "echo -n (gh issue create --title x)"],
  ["create on the line after an unclosed group", "Write-Host -f (1+2\ngh issue create --title x"],
  ["create on the line after an unclosed hashtable", "irm -Headers @{a=1 -Uri z\ngh issue create --title y"],
  ["PowerShell glued += capture of a create", "$x+=gh issue create --title x"],
  ["PowerShell glued ${x}+= capture of an untyped api create", "${x}+=gh api -X POST repos/ImpowerGames/impower/issues -f title=y"],
  ["curl -J before -d", "curl -J -d '{\"title\":\"x\"}' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -sJ before -d", "curl -sJ -d '{\"title\":\"x\"}' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -0 before -d", "curl -0 -d '{\"title\":\"x\"}' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["create after a redirection glued to a dated log file", ">2026-09-05.log gh issue create --title x"],
  ["curl form data with '(type=Bug)' in the title", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d 'title=Support (type=Bug) syntax&body=z'"],
  ["irm -Body: colon form without a type", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body:@{title='x'}"],
  ["irm -Body: multi-line hashtable without a type, followed by a typed-looking token", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body:@{\n  title = 'x'\n} @{type='Bug'}"],
  ["chained PowerShell captures of a create", "$x=$y=gh issue create --title x"],
  ["chained PowerShell captures of an untyped api create", "$a=$b=gh api -X POST repos/ImpowerGames/impower/issues -f title=y"],
  ["curl -F form field without a type", "curl -F 'title=x' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -o before -d", "curl -o out.json -d '{\"title\":\"x\"}' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -w before -d", "curl -w '%{http_code}' -d '{\"title\":\"x\"}' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -su before -d", "curl -su user:pass -d '{\"title\":\"x\"}' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl form data with an apostrophe and '(type=Bug)' in the title", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d "title=Support (type=Bug) in someone\'s editor&body=z"'],
  ["curl raw prose body starting with (type=Bug)", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d '(type=Bug) in the title crashes the parser'"],
  ["hashtable body whose here-string value has a line starting type=Bug", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{\n  title = 'Hook allows an untyped body'\n  body = @'\nThe form field is filled in as\ntype=Bug\nand then submitted.\n'@\n}"],
  ["parenthesised hashtable body whose double-quoted here-string has an indented type= line", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{\n  title = 'x'\n  body  = @\"\nRepro:\n    type = Bug\n\"@\n} | ConvertTo-Json)"],
  ["untyped create after a 9 KB $( ) inside double quotes", 'echo "$(printf %s \'' + "y".repeat(9000) + '\')" && gh issue create --title x'],
  ["untyped api create after a 9 KB $( ) inside double quotes on the next line", 'echo "$(printf %s \'' + "y".repeat(9000) + '\')"\ngh api -X POST repos/ImpowerGames/impower/issues -f title=x'],
  ["untyped api create after a comment with an apostrophe and a $( ) in quotes", "# don't forget\necho \"$(date)\" && gh api -X POST repos/ImpowerGames/impower/issues -f title=x"],
  ["create after a comment with an apostrophe and a $( ) in quotes", "# don't forget\necho \"$(date)\" && gh issue create --title x --body y"],
  ["untyped create after a here-doc body with an apostrophe and a $( ) in quotes", "cat > b.md <<'EOF'\nIt doesn't work.\nEOF\necho \"$(date)\" && gh issue create --title x"],
  ["form-encoded body led by labels[] without a type", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d 'labels[]=bug&title=x'"],
  ["create after a shift with a named operand and a $( ) in quotes", 'x=$((1 << n))\necho "$(date)"\ngh issue create --title x'],
  ["untyped api create after a shift with a named operand", "x=$((1 << n))\ngh api -X POST repos/ImpowerGames/impower/issues -f title=x"],
  ["here-string body with a padded opener and a type= line", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{\n  title = 'x'\n  body =\n        @\"\nRepro:\n    type = Bug\n\"@\n}"],
  ["here-string body with nine spaces before the opener and a type= line", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{\n  title = 'x'\n  body =         @\"\ntype = Bug\n\"@\n} | ConvertTo-Json)"],
  ["here-string body holding an inner = @\" and a type= line", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{\n  title = 'x'\n  body = @\"\ntype = Bug\nthe snippet has $x = @\" in it\n\"@\n} | ConvertTo-Json)"],
  ["here-string body holding an inner @\" and a type= line", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{\n  title = 'x'\n  body = @\"\ntype = Bug\nmail me@\"work\" about it\n\"@\n} | ConvertTo-Json)"],
  ["an unterminated @' mention before a here-string with a type= line", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{\n  title = 'x'\n  note = \"the marker is = @'\"\n  body = @\"\ntype = Bug is prose here\n\"@\n}"],
  ["an empty here-string as the type", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type = @\"\n\"@\n}"],
  ["a whitespace-only here-string as the type", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type = @\"\n\n\"@\n}"],
  ["a multi-line single-quoted note whose second line starts type = @\", then a real here-string", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{\n  title = 'x'\n  note = 'first line\ntype = @\" second'\n  body = @\"\nsteps\n\"@\n}"],
  ["create after a (( )) shift command at a line start", 'echo "$(date)"\n((y = 1 << m))\necho "$(date)"\ngh issue create -t x'],
  ["untyped api create after a (( )) shift command at a line start", "x=1\n((mask = 1 << n))\ngh api -X POST repos/ImpowerGames/impower/issues -f title=x"],
  ["a multi-line array element whose second line starts type=Bug", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; labels=@('bug','one\ntype=Bug\n')}"],
  ["an empty single-quoted type", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type=''}"],
  ["unparseable JSON whose title value mentions a type key", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"the type key is quoted here","body":"x",}\''],
  ["unparseable JSON whose title holds an escaped quote and ', type=Bug' as prose", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"say \\"hi\\", type=Bug","body":"x",}\''],
  ["a curl prose body of the shape word {type=Bug}", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d 'Fix {type=Bug} handling'"],
  ["an unknown cmdlet before a hashtable", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (Out-String @{title='x'})"],
  ["an untyped body behind a second -d with prose after an early-closing quote", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d 'a=1' -d '{\"title\":\"C:\\path\\\", type=Bug is prose\",\"body\":\"x\",}'"],
  ["an untyped PowerShell JSON string body with prose after an early-closing quote", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body '{\"title\":\"C:\\path\\\", type=Bug is prose\",\"body\":\"x\",}'"],
  ["an untyped [ordered] hashtable with a path ending in a backslash and type=Bug in prose", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body ([ordered]@{title=\"C:\\dist\\\"; body=\"remember, type=Bug goes on the call\"} | ConvertTo-Json)"],
  ["an untyped hashtable with a trailing-backslash value followed by a header", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title=\"C:\\dist\\\"; body=\"x\"} -Headers @{Authorization=\"Bearer x\"}"],
  ["an untyped body behind a ConvertTo-Json prefix with -Depth after it", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json ([pscustomobject]@{title=\"x\"}) -Depth 10)"],
  ["an untyped compact hashtable whose value holds a closer and a flag-like word, with -Depth after", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json @{title=\"x\";body=\"run (a) -Raw f\"} -Depth 5)"],
  ["a create after a $( ) following a short flag with an escaped quote", 'echo -n $(cmd "a \\") b") ; gh issue create -t x', "bash"],
  ["a create after a $( ) following a lowercase find-style flag with an escaped quote", 'find . -name $(cmd "a \\") b") ; gh issue create -t x', "bash"],
  ["a create after a $( ) following a lowercase flag cluster with an escaped quote", 'tar -xzf $(cmd "a \\") b") ; gh issue create -t x', "bash"],
  ["an untyped -Body $( ) sub-expression with a trailing-backslash value followed by a ContentType", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $(ConvertTo-Json @{title=\"C:\\dist\\\"; body=\"x\"}) -ContentType \"application/json\""],
  ["a create after a $( ) following sed -E with an escaped quote and a closer", 'sed -E $(pat "said \\"hi\\") again") f.txt ; gh issue create --title x'],
  ["an untyped api create after a $( ) following curl -H with an escaped quote and a closer", 'curl -H $(hdr "Accept: \\"json\\") x") https://x ; gh api -X POST repos/ImpowerGames/impower/issues -f title=x'],
  ["a create after a $( ) following git -C with an escaped quote", 'git -C $(node -e "console.log(\\"d\\")") log ; gh issue create -t x'],
  ["a create after a $( ) following curl -H with a python one-liner", 'curl -H $(python -c "print(\\"X-A: b\\")") https://x ; gh issue create -t x'],
  ["a create after a $( ) following curl -Ls with an escaped quote", 'curl -Ls $(node -e "console.log(\\"Bearer \\" + t)") https://x ; gh issue create --title x --body-file t.md'],
  ["a create after a $( ) following sed -En with an escaped quote and a closer", 'sed -En $(pat "said \\"hi\\") again") f.txt ; gh issue create --title x'],
  ["an untyped api create after a $( ) following curl -Ls with an escaped quote and a closer", 'curl -Ls $(hdr "Accept: \\"json\\") x") https://x ; gh api -X POST repos/ImpowerGames/impower/issues -f title=x'],
  ["an untyped curl create after a $( ) following curl -LsS with a python one-liner", 'curl -LsS $(python -c "print(\\"X-A: b\\")") https://x ; curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d "{\\"title\\":\\"x\\"}"'],
  ["a create after a $( ) following java -Xmx2g with an escaped quote", 'java -Xmx2g $(node -e "console.log(\\"d\\")") ; gh issue create -t x'],
  ["an untyped irm create with a -Headers $( ) holding a trailing-backslash string before the body", 'irm -Headers $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; body="y"}', "powershell"],
  ["an untyped irm create with a -NoProxy:$( ) holding a trailing-backslash string before the body", 'irm -NoProxy:$(Test-Path "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; body="y"}', "powershell"],
  ["an untyped irm create with an all-caps -HEADERS $( ) holding a trailing-backslash string before the body", 'irm -HEADERS $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; body="y"}', "powershell"],
  ["a create after a $( ) following curl -Lsf with an escaped quote", 'curl -Lsf $(node -e "console.log(\\"Bearer \\" + t)") https://x ; gh issue create --title x --body-file t.md'],
  ["a create after a $( ) following sed -Enr with an escaped quote", 'sed -Enr $(node -e "console.log(\\"s/a/b/\\")") f ; gh issue create --title x --body-file t.md'],
  ["a create after a $( ) following tar -Jxvf with an escaped quote", 'tar -Jxvf $(node -e "console.log(\\"a.tar.xz\\")") ; gh issue create --title x --body-file t.md'],
  ["a create after a $( ) following gcc -Wall with an escaped quote", 'gcc -Wall $(node -e "console.log(\\"-DX\\")") main.c ; gh issue create --title x --body-file t.md'],
  ["a create after a $( ) following a lowercase -body with an escaped quote", 'tool -body $(node -e "console.log(\\"x\\")") ; gh issue create --title x --body-file t.md'],
  ["a create after a $( ) following -Uri in a Bash command with an escaped quote", 'tool -Uri $(node -e "console.log(\\"x\\")") ; gh issue create --title x --body-file t.md'],
  // Under the PowerShell tool a backslash is literal inside and outside a
  // string: a Windows path ending in one, or a `\"` in a substitution, does
  // not hide the create that follows.
  ["a create after a cd to a path ending in a backslash under PowerShell", 'cd "C:\\out\\" ; gh issue create --title "x" --body-file t.md', "powershell"],
  ["a create after a Set-Location to a path ending in a backslash under PowerShell", 'Set-Location "C:\\out\\" ; gh issue create --title "x" --body-file t.md', "powershell"],
  ["a create between an assignment of a path ending in a backslash and a Write-Host under PowerShell", '$y = "C:\\out\\" ; gh issue create --title x ; Write-Host "done"', "powershell"],
  ["an untyped irm create after a Write-Host of a path ending in a backslash under PowerShell", 'Write-Host "C:\\dist\\" ; irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; body="y"}', "powershell"],
  ["a create after a $( ) following curl -H with a backslash-quote under PowerShell", 'curl -H $(python -c "print(\\"X-A: b\\")") https://x ; gh issue create -t x'],
  ["a create after a $( ) following git -C with a backslash-quote under PowerShell", 'git -C $(node -e "console.log(\\"d\\")") log ; gh issue create -t x'],
  ["an untyped irm create with a backslash-quoted body under PowerShell", 'irm -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body "{\\"title\\":\\"x\\",\\"type\\":\\"Bug\\"}"', "powershell"],
  ["a create after a bare path ending in a backslash glued to a semicolon under PowerShell", "cd C:\\out\\; gh issue create --title x", "powershell"],
  // PowerShell runs a backslash-terminated line on its own, so the type on
  // the next line does not count and a create on the next line is a
  // statement of its own.
  ["a create on the line after a backslash-terminated echo under PowerShell", "echo a \\\ngh issue create -t x", "powershell"],
  ["a typed create split over Bash-style backslash lines under PowerShell, whose first line is an untyped POST", "gh api -X POST repos/ImpowerGames/impower/issues \\\n  -f title=x \\\n  -f type=Bug", "powershell"],
  ["a typed create split over CRLF Bash-style backslash lines under PowerShell", "gh api -X POST repos/ImpowerGames/impower/issues \\\r\n  -f title=x \\\r\n  -f type=Bug", "powershell"],
  ["a create whose body file argument ends in a backslash before the type line under PowerShell", "gh api -X POST repos/ImpowerGames/impower/issues -f title=x -F body=@ticket.md\\\n  -f type=Bug", "powershell"],
  ["a create whose body path ends in a backslash before the type line under PowerShell", "gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f body=C:\\repro\\\n  -f type=Bug", "powershell"],
  ["a gh issue create whose title ends in a backslash before a --repo line under PowerShell", "gh issue create --title x\\\n  -R other/repo", "powershell"],
  ["an untyped implicit-POST create continued onto a flag line whose body says read-only, with no tool name", "gh api repos/ImpowerGames/impower/issues \\\n  -f title=x \\\n  -f 'body=the tree is read-only'", "bash"],
  ["a create after a comment naming a cmdlet and a bare path ending in a backslash, with no tool name", "# Get-Content leaves the file locked\ncd C:\\out\\\ngh issue create --title x", "powershell"],
  // In a Bash command a backtick pair is a substitution even before `$`.
  ["a create in a backquote around a $( ) inside double quotes under Bash", 'echo "`$(gh issue create --title x)`"', "bash"],
  // gh issue create needs a --type value.
  ["gh issue create with --type and no value", "gh issue create --title x --type"],
  ["gh issue create with --type followed by another flag", "gh issue create --type --title x"],
  ["gh issue create with an empty --type", 'gh issue create --title x --type ""'],
  ["gh issue create with -T, which is the template flag", "gh issue create -T Bug --title x"],
  // A hashtable group after a flag is analysed for the commands it runs.
  ["a create inside a hashtable value after a flag under Bash", "echo -x @{a=$(gh issue create -t x)}"],
  ["a create inside a hashtable value after a flag under PowerShell", "echo -x @{a=$(gh issue create -t x)}"],
  ["a create inside an irm -Headers hashtable value under PowerShell", "irm -Headers @{a=$(gh issue create -t x)} -Uri https://x"],
  ["a create in a parenthesised irm -Headers hashtable value under PowerShell", "irm -Headers @{a=(gh issue create -t x)} -Uri https://x"],
  ["a create as an irm -Body group under PowerShell", "irm -Body (gh issue create -t x) -Uri https://x"],
  // A backtick pair inside a double-quoted string is a substitution only
  // in a Bash command.
  ["a PR comment quoting the phrase in backticks under Bash", 'gh pr comment 445 --body "prefer `gh api` over `gh issue create` here"', "bash"],
  ["a create after a backtick-escaped quote in a Write-Host string under PowerShell", 'Write-Host "x`"y" ; gh issue create -t x'],
  ["an untyped curl create after an unbalanced flag group", 'echo -a @{ ; curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d "{\\"title\\":\\"x\\",\\"body\\":\\"y\\"}"'],
  // A JSON string body is read with JSON escapes whichever shell sends it,
  // so this body, which is not valid JSON (a bare `\s` and a `\"` that
  // swallows the closing quote), is refused.
  ["a PowerShell JSON string body with a path ending in a backslash", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body '{\"title\":\"C:\\src\\\",\"type\":\"Bug\"}'"],
];

const allows = [
  ["typed create", 'gh api -X POST repos/ImpowerGames/impower/issues -f title="x" -F body=@ticket.md -f type=Task -f "labels[]=workflow: ci"'],
  ["typed create with --field", "gh api --method POST repos/ImpowerGames/impower/issues --field title=x --field type=Bug"],
  ["typed create, type quoted", 'gh api -X POST repos/ImpowerGames/impower/issues -f "type=Feature" -f title=x'],
  ["typed create, implicit POST", "gh api repos/ImpowerGames/impower/issues -f title=x -f type=Bug -F body=@ticket.md"],
  ["typed create, --raw-field=type=", "gh api repos/ImpowerGames/impower/issues --raw-field=title=x --raw-field=type=Task"],
  ["typed create, -F type=Bug is still a string", "gh api repos/ImpowerGames/impower/issues -f title=x -F type=Bug"],
  ["typed create, absolute URL", "gh api https://api.github.com/repos/ImpowerGames/impower/issues -f title=x -f type=Bug"],
  ["typed create, -X=POST", "gh api -X=POST repos/ImpowerGames/impower/issues -f title=x -f type=Bug"],
  ["typed create, multi-line with --jq", "gh api -X POST repos/ImpowerGames/impower/issues \\\n  -f title=x -f type=Bug \\\n  --jq '{number, url: .html_url, type: .type.name}'", "bash"],
  ["typed create, PowerShell backtick continuation", "gh api -X POST repos/ImpowerGames/impower/issues `\n  -f title=x `\n  -f type=Bug"],
  ["typed create, PowerShell backtick continuation with CRLF", "gh api -X POST repos/ImpowerGames/impower/issues `\r\n  -f title=x `\r\n  -f type=Bug"],
  ["typed create with a trailing comment", "gh api repos/ImpowerGames/impower/issues -f title=x -f type=Bug   # not gh issue create"],
  ["typed create from the recipe, run through a cd", 'cd "$S" && gh api -X POST repos/ImpowerGames/impower/issues -f title="t" -F body=@ticket.md -f type=Task -f "labels[]=workflow: skill" --jq \'{number, url: .html_url, type: .type.name}\''],
  ["reading an issue", "gh issue view 443 --json title,body,labels"],
  ["editing an issue", "gh issue edit 443 --body-file ticket.md"],
  ["listing issues", 'gh issue list --label "workflow: ci"'],
  ["listing issues with -R before the subcommand", "gh -R ImpowerGames/impower issue list --limit 1"],
  ["issue create in another repo", "gh issue create -R other/repo --title x"],
  ["issue create in another repo, --repo=", "gh issue create --repo=other/repo --title x"],
  ["issue create in another repo, -R before the subcommand", "gh -R other/repo issue create --title x"],
  ["GET on the issues collection", "gh api repos/ImpowerGames/impower/issues?state=open"],
  ["GET on the issues collection with an explicit method and fields", "gh api -X GET repos/ImpowerGames/impower/issues -f state=open"],
  ["GET on the issues collection with -X=GET", "gh api -X=GET repos/ImpowerGames/impower/issues -f state=open"],
  ["paginated GET", "gh api --paginate repos/ImpowerGames/impower/issues --jq '.[].number'"],
  ["PATCH on one issue", "gh api -X PATCH repos/ImpowerGames/impower/issues/443 -f type=Task"],
  ["PUT on the collection", "gh api -X PUT repos/ImpowerGames/impower/issues -f title=x"],
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
  ["pr create whose title mentions the phrase", 'gh pr create --title "ci(github): stop using gh issue create" --body-file pr-body.md'],
  ["grep for the phrase", 'grep -rn "gh issue create" .claude'],
  ["echo of the recipe", 'echo "gh api -X POST repos/ImpowerGames/impower/issues -f title=x"'],
  ["unquoted echo of the phrase", "echo do not use gh issue create"],
  ["the phrase in a trailing comment", "npm test   # no longer uses gh issue create"],
  ["the phrase in a here-doc body", "cat > note.md <<'EOF'\nNever run gh issue create in this repo.\nEOF"],
  ["the phrase in a here-doc piped to a pr comment", "gh pr comment 445 --body-file - <<'EOF'\nRound 1 found that gh issue create was refused.\nEOF"],
  ["the phrase in a tab-indented <<- here-doc", "cat <<-EOF\n\tgh issue create is gone\n\tEOF\necho ok"],
  ["a GET and a comment POST in one command", 'gh api repos/ImpowerGames/impower/issues --paginate --jq ".[].number" && gh api -X POST repos/ImpowerGames/impower/issues/443/comments -F body=@note.md'],
  ["comment body that names the collection", 'gh api -X POST repos/ImpowerGames/impower/issues/445/comments -f body="the hook guards repos/O/R/issues and refuses untyped creates"'],
  ["multi-line command with a typed create and a view", "gh api repos/ImpowerGames/impower/issues -f title=x -f type=Bug\ngh issue view 443"],
  ["curl GET on the collection", "curl https://api.github.com/repos/ImpowerGames/impower/issues?state=open"],
  ["curl typed create", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x","type":"Bug"}\''],
  ["Invoke-RestMethod GET", "Invoke-RestMethod -Uri https://api.github.com/repos/ImpowerGames/impower/issues?state=open"],
  ["PowerShell command with backslash paths", 'Get-ChildItem -Path "C:\\Users\\dev\\impower\\packages" -Recurse -Filter "*.test.ts"'],
  ["unrelated command", "npm run web:dev"],
  ["unrelated command containing gh as a substring", "npm run highlight && rg -n right src"],
  ["grep -c for the phrase", "grep -c 'gh issue create' README.md"],
  ["grep -ic for the phrase", "grep -ic 'gh issue create' README.md"],
  ["rg -c for the phrase", "rg -c 'gh issue create' ."],
  ["tar -cf with the phrase as a name", "tar -cf 'gh issue create'"],
  ["plain here-doc whose body has a tab-indented delimiter and the phrase", "cat <<EOF\n\tEOF\ngh issue create --title x\nEOF"],
  ["a shift expression followed by a view", "echo $((1 << 2))\ngh issue view 443"],
  ["Invoke-RestMethod typed hashtable body", "Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{title='x'; type='Bug'} | ConvertTo-Json) -ContentType 'application/json'"],
  ["curl typed with --json", 'curl --json \'{"title":"x","type":"Bug"}\' https://api.github.com/repos/ImpowerGames/impower/issues'],
  ["a view inside an if", "if gh issue view 443; then echo ok; fi"],
  ["a loop with no create", "for f in a b; do echo $f; done"],
  ["timeout around an unrelated command", "timeout 30 npm test"],
  ["typed create inside a for loop", "for f in a b; do gh api repos/ImpowerGames/impower/issues -f title=$f -f type=Task; done"],
  ["typed create through sudo -u", "sudo -u me gh api repos/ImpowerGames/impower/issues -f title=x -f type=Bug"],
  ["a here-doc with no terminator holds the phrase", "cat > note.md <<'EOF'\ngh issue create is refused here."],
  ["a here-doc whose terminator has a trailing space", "cat > note.md <<'EOF'\ngh issue create is refused here.\nEOF "],
  ["a shift with a variable operand, then a view", "echo $((x << y))\ngh issue view 443"],
  ["a shift with a variable operand, then a typed create with a $( ) title", 'echo $((a << b))\ngh api -X POST repos/ImpowerGames/impower/issues -f "title=$(cat t.md)" -f type=Bug'],
  ["a shift with a variable operand, then a typed hashtable create", "x=$((1 << n))\nirm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'}"],
  ["a type supplied as a here-string", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type = @\"\nBug\n\"@\n}"],
  ["a typed body with a '= @\"' mention in a value before the here-string", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{\n  note = 'the idiom is $x = @\" here'\n  type = 'Bug'\n  body = @\"\nrepro\n\"@\n}"],
  ["a typed body with a ': @\"' mention in a value before the here-string", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{\n  note = 'see the docs: @\" is a here-string'\n  type = 'Bug'\n  body = @\"\nrepro\n\"@\n}"],
  ["a typed body with a '= @\"' mention in a double-quoted value before the here-string", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{\n  note = \"the idiom is = @\"\n  type = 'Bug'\n  body = @\"\nrepro\n\"@\n} | ConvertTo-Json)"],
  ["a quoted shift with a named operand, then a typed create with a $( ) title", 'echo "mask=$((1 << n))"\ngh api -X POST repos/ImpowerGames/impower/issues -f "title=$(date +%F) crash" -f type=Bug'],
  ["a quoted shift with a named operand, then a typed hashtable create", 'echo "shift: $((1 << n))"\nirm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title=\'x\'; type=\'Bug\'}'],
  ["a triple-paren arithmetic, a here-doc with a lone quote, then a typed create", "x=$(((a+b)*c)) && cat > n.md <<'EOF'\npass the \" flag\nEOF\nirm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title=\"x\"; type=\"Bug\"}"],
  ["a nested-paren shift, then a here-doc, then a typed create", "x=$(((a) << b)); cat <<EOF\nbody (\nEOF\ngh api -X POST repos/ImpowerGames/impower/issues -f \"title=$(cat t.md)\" -f type=Bug"],
  ["a (( )) shift command at a line start, then a typed create with a $( ) title", "x=4\n((mask = 1 << n))\ngh api -X POST repos/ImpowerGames/impower/issues -f \"title=$(cat t.md)\" -f type=Bug"],
  ["a (( )) shift command at a line start, then a typed hashtable create", "x=4\n((mask = 1 << n))\nirm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'}"],
  ["a negated (( )) shift, then a typed create", "!((1 << n))\ngh api -X POST repos/ImpowerGames/impower/issues -f \"title=$(cat t.md)\" -f type=Bug"],
  ["a (( )) shift command at a CRLF line start, then a typed create", "x=4\r\n((mask = 1 << n))\r\ngh api -X POST repos/ImpowerGames/impower/issues -f \"title=$(cat t.md)\" -f type=Bug"],
  ["a typed hashtable with a double-quoted path ending in a backslash before the type", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; path=\"C:\\src\\\"; type='Bug'}"],
  ["a typed hashtable with a double-quoted path ending in a backslash and a double-quoted type", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{path=\"C:\\repo\\\"; type=\"Bug\"}"],
  ["a typed hashtable with a regex value ending in a backslash", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; pattern=\"\\d+\\\"; type='Bug'}"],
  ["a typed body in the prefix-call ConvertTo-Json form", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json @{title='x'; type='Bug'})"],
  ["a typed body in the ConvertTo-Json -Depth form", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json -Depth 10 @{title='x'; type='Bug'})"],
  ["a typed body in the ConvertTo-Json -InputObject form", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json -InputObject @{title='x'; type='Bug'})"],
  ["a typed body in the ConvertTo-Json -Compress form", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json -Compress @{title='x'; type='Bug'})"],
  ["a typed body in a double-parenthesised pipe form", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body ((@{title='x'; type='Bug'}) | ConvertTo-Json)"],
  ["a typed body piped to ConvertTo-Json -Depth", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{title='x'; type='Bug'} | ConvertTo-Json -Depth 4)"],
  ["a typed PowerShell JSON string body with a raw newline and an escaped quote", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body '{\"title\":\"x\",\"body\":\"He said \\\" once\nand again\",\"type\":\"Bug\"}'"],
  ["a typed here-string JSON body with an escaped quote and a trailing comma", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @\"\n{\n  \"title\": \"Fix the \\\" escape\",\n  \"type\": \"Bug\",\n}\n\"@"],
  ["a typed body behind a second -d", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d 'note=1' -d '{\"title\":\"a \\\" b\",\"type\":\"Bug\",}'"],
  ["a typed PowerShell hashtable handed to curl --data-raw", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues --data-raw '@{path=\"C:\\logs\\\"; note=\"x\"; type=\"Bug\"}'"],
  ["a typed [ordered] hashtable with a path ending in a backslash", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body ([ordered]@{title=\"C:\\dist\\\"; type=\"Bug\"} | ConvertTo-Json)"],
  ["a typed [pscustomobject] hashtable with a path ending in a backslash", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body ([pscustomobject]@{title=\"x\"; body=\"under C:\\logs\\\"; type=\"Bug\"} | ConvertTo-Json)"],
  ["a typed [pscustomobject] hashtable behind a ConvertTo-Json prefix", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json ([pscustomobject]@{title=\"x\"; body=\"under C:\\logs\\\"; type=\"Bug\"}))"],
  ["a typed [ordered] body followed by an Authorization header", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body ([ordered]@{title=\"C:\\dist\\\"; type=\"Bug\"} | ConvertTo-Json) -Headers @{Authorization=\"Bearer x\"}", "powershell"],
  ["a typed [ordered] body followed by a ContentType", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body ([ordered]@{title=\"C:\\dist\\\"; type=\"Bug\"} | ConvertTo-Json) -ContentType \"application/json\"", "powershell"],
  ["a typed plain hashtable with a trailing-backslash value followed by a header", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title=\"C:\\dist\\\"; type=\"Bug\"} -Headers @{Authorization=\"Bearer x\"}"],
  ["a typed [pscustomobject] hashtable behind a ConvertTo-Json prefix with -Depth after it", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json ([pscustomobject]@{title=\"x\"; type=\"Bug\"}) -Depth 10)"],
  ["a typed hashtable behind a ConvertTo-Json prefix with -Compress after it", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json @{title='x'; type='Bug'} -Compress)"],
  ["a typed compact hashtable whose value holds a closer and a flag-like word, with -Depth after", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json @{title=\"preview is black\";body=\"repro: Get-Content (main.sd) -Raw fails\";type=\"Bug\"} -Depth 5)"],
  ["a typed compact hashtable whose value holds a bracket and a flag-like word, with -Depth after", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json @{title=\"x\";body=\"see step [2] -Raw output\";type=\"Bug\"} -Depth 10)"],
  ["a typed Bash create inside a $( ) after a short flag with an escaped quote in a title", 'echo -n $(gh api -X POST repos/ImpowerGames/impower/issues -f "title=x \\") y" -f type=Bug)', "bash"],
  ["a typed curl create inside a $( ) after a short flag with a closer in the body", 'echo -n $(curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d "{\\"title\\":\\"x\\",\\"body\\":\\"step 1) do it\\",\\"type\\":\\"Bug\\"}")', "bash"],
  ["a typed double-parenthesised body followed by a header", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body ((@{title=\"C:\\dist\\\"; type=\"Bug\"}) | ConvertTo-Json) -ContentType \"application/json\"", "powershell"],
  ["a typed double-parenthesised ConvertTo-Json prefix followed by a ContentType", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body ((ConvertTo-Json @{title=\"C:\\dist\\\"; type=\"Bug\"})) -ContentType \"application/json\"", "powershell"],
  ["a typed -Body $( ) sub-expression with a trailing-backslash value followed by a ContentType", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $(ConvertTo-Json @{title=\"C:\\dist\\\"; type=\"Bug\"}) -ContentType \"application/json\"", "powershell"],
  ["a typed -Body $( ) pipe form with a trailing-backslash value followed by a header", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $(@{title=\"C:\\dist\\\"; type=\"Bug\"} | ConvertTo-Json) -Headers @{Accept=\"x\"}", "powershell"],
  ["a typed -Body after a backtick continuation with a trailing-backslash value and a header", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body `\n(@{title=\"C:\\dist\\\"; type=\"Bug\"} | ConvertTo-Json) -ContentType \"application/json\"", "powershell"],
  ["a typed create nested 4000 parentheses deep after a short flag", "echo -n " + "(".repeat(4000) + "\"a\" " + ")".repeat(4000) + "; gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f type=Bug"],
  ["a typed curl create inside a $( ) after curl -H with a closer in the body", 'curl -H $(curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d "{\\"title\\":\\"x\\",\\"body\\":\\"step 1) do it\\",\\"type\\":\\"Bug\\"}") https://x', "bash"],
  ["a typed curl create inside a $( ) after curl -Ls with a closer in the body", 'curl -Ls $(curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d "{\\"title\\":\\"x\\",\\"body\\":\\"step 1) do it\\",\\"type\\":\\"Bug\\"}") https://x', "bash"],
  ["a typed irm create with a -Headers $( ) holding a trailing-backslash string before the body", 'irm -Headers $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; type="Bug"}'],
  ["a typed irm create with a -Uri $( ) holding a trailing-backslash string before the body", 'irm -Method Post -Uri $(Get-Content "C:\\u\\") -Body @{title="x"; type="Bug"} -ContentType "application/json"'],
  ["a typed irm create with a -Uri: $( ) holding a trailing-backslash string before the body", 'irm -Method Post -Uri:$(Get-Content "C:\\u\\") -Body @{title="x"; type="Bug"} -ContentType "application/json"'],
  ["a typed irm create with a -ContentType $( ) holding a trailing-backslash string before the body", 'irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -ContentType $(Get-Content "C:\\u\\") -Body @{title="x"; type="Bug"}', "powershell"],
  ["a typed irm create with an all-caps -HEADERS $( ) holding a trailing-backslash string before the body", 'irm -HEADERS $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; type="Bug"}'],
  ["a typed irm create with a -H $( ) holding a trailing-backslash string before the body", 'irm -H $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; type="Bug"}'],
  ["a typed irm create with a lowercase -headers $( ) holding a trailing-backslash string before the body", 'irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -headers $(Get-Content "C:\\dist\\") -Body @{title="x"; type="Bug"}', "powershell"],
  ["a typed curl create inside a $( ) after curl -Lsf with a closer in the body", 'curl -Lsf $(curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d "{\\"title\\":\\"x\\",\\"body\\":\\"step 1) do it\\",\\"type\\":\\"Bug\\"}") https://x', "bash"],
  ["a typed curl create inside a $( ) after gcc -Wall with a closer in the body", 'gcc -Wall $(curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d "{\\"title\\":\\"x\\",\\"body\\":\\"step 1) do it\\",\\"type\\":\\"Bug\\"}") main.c', "bash"],
  ["a typed -Body after a CRLF backtick continuation with a trailing-backslash value and a ContentType", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body `\r\n(@{title=\"C:\\dist\\\"; type=\"Bug\"} | ConvertTo-Json) -ContentType \"application/json\"", "powershell"],
  ["a typed body in the ConvertTo-Json -Depth:10 colon form", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (ConvertTo-Json -Depth:10 @{title='x'; type='Bug'})"],
  ["a typed body piped to ConvertTo-Json then Out-String", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{title='x'; type='Bug'} | ConvertTo-Json | Out-String)"],
  ["unparseable JSON with a quoted type key kept", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"type":"Bug","title":"x",}\''],
  ["a typed hashtable whose value holds an escaped quote in JSON-like text", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"a \\"quoted\\" word","type":"Bug",}\''],
  ["typed form data in Bash ANSI-C quoting", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues --data $'title=x&type=Bug'"],
  ["a view inside a double-quoted $( )", 'echo "issue: $(gh issue view 443 --json title)"'],
  ["curl -G with query data", "curl -G -d labels=bug https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -sSL GET", "curl -sSL https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl typed with a Content-Type header", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -H "Content-Type: application/json" -d \'{"title":"x","type":"Bug"}\''],
  ["Invoke-RestMethod typed with a quoted Content-Type header key", "Invoke-RestMethod -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Headers @{'Content-Type'='application/json'} -Body '{\"title\":\"x\",\"type\":\"Bug\"}'"],
  ["Invoke-RestMethod typed hashtable body with spaces", "Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{ title = 'x'; type = 'Bug' } | ConvertTo-Json)"],
  ["pwsh -NoProfile -Command with a view", "pwsh -NoProfile -Command 'gh issue view 443'"],
  ["grep -c after a shell name elsewhere in the command", "bash script.sh && grep -c 'gh issue create' README.md"],
  ["a C++ file written through a terminated here-doc", "cat > f.cpp <<'EOF'\nstd::cout << a << b;\nstd::cout << c;\nEOF\ngh issue view 443"],
  ["a PowerShell newline escape before a view", 'Write-Host "hello`nworld"; gh issue view 443'],
  ["a PowerShell capture of a view", "$n = gh issue view 443 --json number"],
  ["a PowerShell capture of a typed create", "$out = gh api repos/ImpowerGames/impower/issues -f title=x -f type=Bug"],
  ["Invoke-RestMethod typed $( ) body", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $(@{title='x'; type='Bug'} | ConvertTo-Json)"],
  ["Invoke-RestMethod typed bare hashtable body", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'}"],
  ["Invoke-RestMethod typed body on the next line", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body `\n(@{title='x'; type='Bug'} | ConvertTo-Json)"],
  ["Invoke-RestMethod typed body with a paren in the title", "Invoke-RestMethod -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body ('{\"title\":\"a :) b\",\"type\":\"Bug\"}')"],
  ["Invoke-RestMethod typed hashtable with a paren in the title", "Invoke-RestMethod -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body (@{title='smile :)'; type='Bug'} | ConvertTo-Json)"],
  ["curl -sG with query data", "curl -sG -d labels=bug https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -X GET with data", "curl -X GET https://api.github.com/repos/ImpowerGames/impower/issues -d q=1"],
  ["bash -s -- grep -c for the phrase", "bash -s -- grep -c 'gh issue create' README.md"],
  ["pwsh -File with a -c argument", "pwsh -File run.ps1 -c 'gh issue create'"],
  ["echo of a shell -c string", "echo bash -c 'gh issue create --title x'"],
  ["a glued group before a here-doc holding the phrase", "Write-Output ((Get-Item x).Length)\ncat > t.md <<'EOF'\ngh issue create is refused here.\nEOF"],
  ["a 2>&1 view", "2>&1 gh issue view 443"],
  ["Invoke-RestMethod typed double-quoted body with backtick-escaped quotes", 'irm -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body "{`"title`":`"x`",`"type`":`"Bug`"}"', "powershell"],
  ["Invoke-RestMethod typed double-quoted body with backslash-escaped quotes, read as Bash", 'irm -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body "{\\"title\\":\\"x\\",\\"type\\":\\"Bug\\"}"', "bash"],
  // Under the PowerShell tool a backslash is literal, so a Windows path
  // ending in one does not swallow the rest of the line.
  ["a typed create after a cd to a path ending in a backslash under PowerShell", 'cd "C:\\out\\" ; gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f type=Bug'],
  ["a typed irm create after a Write-Host of a path ending in a backslash under PowerShell", 'Write-Host "C:\\dist\\" ; irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; type="Bug"}'],
  ["a comment on an issue after a cd to a path ending in a backslash under PowerShell", 'cd "C:\\out\\" ; gh api -X POST repos/ImpowerGames/impower/issues/443/comments -f body=x'],
  ["an implicit-POST create split over a Bash-style backslash line under PowerShell, where neither line creates", "gh api repos/ImpowerGames/impower/issues \\\n  -f title=x", "powershell"],
  ["a backquote around a $( ) inside double quotes under PowerShell, where the backtick escapes the dollar", 'echo "`$(gh issue create --title x)`"', "powershell"],
  ["a typed create inside a hashtable value after a flag under Bash", "echo -x @{a=$(gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f type=Bug)}"],
  ["a typed create inside an irm -Headers hashtable value under PowerShell", "irm -Headers @{a=$(gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f type=Bug)} -Uri https://x"],
  ["gh issue create with --type Bug", "gh issue create --title x --body y --type Bug"],
  ["gh issue create with --type=Task", "gh issue create --type=Task --title x --body-file ticket.md"],
  ["gh issue create with --type Feature and this repo named", "gh issue create --type Feature -R ImpowerGames/impower --title x"],
  ["gh issue create with --type Bug under PowerShell", "gh issue create --title x --type Bug"],
  ["a PR comment quoting the phrase in backticks under PowerShell", 'gh pr comment 445 --body "prefer `gh api` over `gh issue create` here"', "powershell"],
  ["a Write-Host quoting the phrase in backticks under PowerShell", 'Write-Host "run `gh issue create` by hand"', "powershell"],
  ["Invoke-RestMethod typed single-quoted body with a doubled apostrophe", "Invoke-RestMethod -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body '{\"title\":\"it''s broken\",\"type\":\"Bug\"}'"],
  ["Invoke-RestMethod typed here-string body", 'Invoke-RestMethod -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -ContentType application/json -Body @"\n{"title":"x","type":"Bug"}\n"@'],
  ["Invoke-RestMethod typed parenthesised body before -Uri", "Invoke-RestMethod -Method Post -Body (@{title='x'; type='Bug'} | ConvertTo-Json) -Uri https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["Invoke-RestMethod typed hashtable with a header hashtable before it", "irm -Method Post -Headers @{'Content-Type'='application/json'} -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title=\"Don't\"; type='Bug'}"],
  ["curl -sX GET with data", "curl -sX GET https://api.github.com/repos/ImpowerGames/impower/issues -d q=1"],
  ["curl typed form data", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d 'title=x&type=Bug'"],
  ["curl typed --data-urlencode", "curl https://api.github.com/repos/ImpowerGames/impower/issues --data-urlencode 'title=x' --data-urlencode 'type=Bug'"],
  ["a long PowerShell string full of escapes before a view", 'Write-Host "' + "line`n".repeat(20000) + '"; gh issue view 443'],
  ["irm -Body: colon form with a type", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body:@{title='x'; type='Bug'}"],
  ["a view in a $( ) after a short flag", "echo -n $(gh issue view 443 --json number)"],
  ["curl -sJ -o download", "curl -sJ -o out.json https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -o eating a -d that is its value", "curl -o -d out.json https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -F form fields with a type", "curl -F 'title=x' -F 'type=Bug' https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["irm -Body: with a space after the colon", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body: @{title='x'; type='Bug'}"],
  ["irm -Body: multi-line typed hashtable", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body:@{\n  title = 'x'\n  type = 'Bug'\n} -ContentType 'application/json'"],
  ["Invoke-RestMethod typed newline-separated hashtable body", "Invoke-RestMethod -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{\n  title = 'x'\n  type  = 'Bug'\n} | ConvertTo-Json)"],
  ["Invoke-RestMethod typed hashtable with a backtick-escaped quote in a value", 'irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="5`" display"; type=\'Bug\'}'],
  ["Invoke-RestMethod typed hashtable with a doubled apostrophe in a value", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='it''s'; type='Bug'}"],
  ["Invoke-RestMethod typed hashtable with a value ending in a backslash", 'irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title=\'x\'; type=\'Bug\'; log="C:\\logs\\"}'],
  ["Invoke-RestMethod typed hashtable with a Windows path value", 'irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title=\'x\'; path="C:\\src\\file.md"; type=\'Bug\'}'],
  ["Invoke-RestMethod typed hashtable with a single-quoted path ending in a backslash", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; path='C:\\src\\'; type='Bug'}"],
  ["typed 9 KB hashtable body", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'; body='" + "z".repeat(9000) + "'}"],
  ["typed 9 KB parenthesised body", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{title='x'; type='Bug'; body='" + "z".repeat(9000) + "'} | ConvertTo-Json)"],
  ["typed 9 KB -Body: value", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body:@{title='x'; type='Bug'; body='" + "z".repeat(9000) + "'}"],
  ["typed api create with a 9 KB $( ) title", "gh api -X POST repos/ImpowerGames/impower/issues -f \"title=$(printf '%s' '" + "z".repeat(9000) + "')\" -f type=Bug"],
  ["curl -w with -d as its value", "curl -w -d out.json https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -u with -d as its value", "curl -u -d out.json https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["typed api create after a here-doc body with an apostrophe (the recipe)", "cat > ticket.md <<'EOF'\nThe preview doesn't load.\nEOF\ngh api -X POST repos/ImpowerGames/impower/issues -f \"title=$(head -1 ticket.md)\" -F body=@ticket.md -f type=Bug"],
  ["typed api create after a comment with an apostrophe", "# gh can't set the type, so use the REST call\ngh api -X POST repos/ImpowerGames/impower/issues -f \"title=$(cat title.txt)\" -f type=Bug"],
  ["typed PowerShell create after a comment with an apostrophe", "# don't forget the type\nInvoke-RestMethod -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{title='x'; type='Bug'} | ConvertTo-Json)"],
  ["typed -Body: create after a comment with an apostrophe", "# don't forget the type\nirm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body:@{title='x'; type='Bug'}"],
  ["typed hashtable create after a comment with a lone double quote", "# say \"hello\nirm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'}"],
  ["typed api create with the Bash apostrophe idiom in a title", "gh api -X POST repos/ImpowerGames/impower/issues -f 'title=it'\\''s broken' -f \"body=$(cat b.md)\" -f type=Bug", "bash"],
  ["form-encoded body led by labels[] with a type", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d 'labels[]=bug&title=x&type=Bug'"],
  ["form-encoded body with a leading ampersand and a type", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d '&title=x&type=Bug'"],
  ["typed JSON body in Bash ANSI-C quoting", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues --data $'{\"title\":\"x\",\"type\":\"Bug\"}'"],
  ["typed hashtable whose value mentions '= @\"' many times", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'; body='" + "the script writes $x = @\" then more text. ".repeat(2000) + "'}"],
  ["empty command", ""],
];

// These shapes must stay linear: the quadratic versions took ten seconds or
// more at these sizes, so a two-second budget leaves an order of magnitude
// of headroom for a slow runner.
{
  const guard = (label, command, shell) => {
    const t0 = Date.now();
    decide(command, shell);
    check(Date.now() - t0 < 2000, `${label} decide in under 2 s`, `${Date.now() - t0} ms`);
  };
  guard("128000 glued PowerShell assignments", Array.from({ length: 128000 }, (_, i) => `$a${i}=1`).join(" ") + " gh issue view 443");
  guard("40000 chained PowerShell assignments in one token", "$a=".repeat(40000) + "gh issue view 443");
  guard("a 240000-character bare word", "echo " + "x".repeat(240000) + " && gh issue view 443");
  guard("a 300 KB hashtable value mentioning '= @\"' 8000 times", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'; body='" + "the script writes $x = @\" then more. ".repeat(8000) + "'}");
  guard("a hashtable value with 32000 lines starting with \"@", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'; body='" + "\n\"@".repeat(32000) + "'}");
  guard("a 400 KB hashtable value mentioning me@\"work\" 16000 times", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'; body='" + 'mail me@"work" about it. '.repeat(16000) + "'}");
  guard("a hashtable with 8000 here-string values", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'; " + Array.from({ length: 8000 }, (_, i) => `k${i} = @"\nline\n"@`).join("\n") + "\n}");
  guard("a hashtable with 64000 unterminated here-string openers", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'; " + Array.from({ length: 64000 }, (_, i) => `k${i} = @"`).join("\n") + "\n}");
  guard("a hashtable with 32000 here-string values whose terminators are indented", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'; " + Array.from({ length: 32000 }, (_, i) => `k${i} = @"\nline\n  "@`).join("\n") + "\n}");
  guard("a 340 KB unparseable JSON body with 16000 escaped quotes and a value ending in a backslash", "curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d '{\"title\":\"x\",\"type\":\"Bug\",\"body\":\"" + 'He said \\"hi\\" then. '.repeat(16000) + "see C:\\logs\\\",}'");
  guard("a command with 64000 unterminated double quotes after a $( ) in quotes", 'echo "$(date)" ' + '`"'.repeat(64000));
  guard("a command with 64000 backtick-escaped quotes in a row", "echo " + '"`=`'.repeat(64000) + " && gh issue view 443");
  guard("a 64 KB run of spaces inside a hashtable value", "irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title='x'; type='Bug'; body='" + " ".repeat(65536) + "'}");
  guard("64000 nested parentheses holding 64000 strings after a short flag", "echo -n " + "( ".repeat(64000) + '"a" '.repeat(64000) + ") ".repeat(64000) + "; gh issue create -t x");
  guard("10000 shifts with named operands, then a typed create", Array.from({ length: 10000 }, (_, i) => `x=$((y << n${i}))`).join("\n") + "\ngh api -X POST repos/ImpowerGames/impower/issues -f title=x -f type=Bug");
  guard("32000 unbalanced groups after flags", "echo " + "-a ( ".repeat(32000));
  guard("32000 unbalanced hashtables after flags", "echo " + "-a @{ ".repeat(32000) + "}");
  guard("32000 balanced groups after flags", "echo " + "-a (1) ".repeat(32000));
  // The same three under the PowerShell tool, where every group after a
  // parameter is that parameter's value and an unclosed one forces a retry.
  guard("32000 unbalanced parameter groups under PowerShell", "echo " + "-a ( ".repeat(32000), "powershell");
  guard("32000 unbalanced parameter hashtables under PowerShell", "echo " + "-a @{ ".repeat(32000) + "}", "powershell");
  guard("32000 balanced parameter groups under PowerShell", "echo " + "-a (1) ".repeat(32000), "powershell");
  guard("32000 unbalanced parameter substitutions under PowerShell", "echo " + "-a $( ".repeat(32000), "powershell");
}

// The backtick scan inside a double-quoted string must stay linear.
{
  const t0 = Date.now();
  decide('Write-Host "' + "a`n".repeat(40000) + '"; gh issue create --title x');
  check(Date.now() - t0 < 2000, "40000 backtick escapes in one string decide in under 2 s", `${Date.now() - t0} ms`);
}

// The here-doc and command-position passes must stay linear: a large command
// full of `<<` operators, and a segment of many assignments, both decide fast.
{
  // Arithmetic shifts, so every line is tokenized rather than swallowed as a
  // here-doc body.
  const many = Array.from({ length: 10000 }, (_, i) => `x=$((y << ${i % 7}))`).join("\n");
  let t0 = Date.now();
  decide(many);
  check(Date.now() - t0 < 2000, "10000 lines of << operators decide in under 2 s", `${Date.now() - t0} ms`);
  const assigns = Array.from({ length: 50000 }, (_, i) => `A${i}=1`).join(" ") + " gh issue create --title x";
  t0 = Date.now();
  const r = decide(assigns);
  check(typeof r === "string" && Date.now() - t0 < 2000, "50000 assignments before a create decide in under 2 s", `${Date.now() - t0} ms, ${JSON.stringify(r)?.slice(0, 40)}`);
}

// A third column names the shell the tool name would give the hook;
// without one the hook infers it from the command, and the row must then
// decide the same under both shells, so no row leans on the inference.
let shellNeutral = 0;
for (const [label, command, shell] of denies) {
  const reason = decide(command, shell);
  check(typeof reason === "string" && reason.includes("type=Bug"), `denied: ${label}`, `got ${JSON.stringify(reason)}`);
  if (!shell && typeof decide(command, "bash") === "string" && typeof decide(command, "powershell") === "string") shellNeutral++;
}
for (const [label, command, shell] of allows) {
  const reason = decide(command, shell);
  check(reason === null, `allowed: ${label}`, `got ${JSON.stringify(reason)}`);
  if (!shell && decide(command, "bash") === null && decide(command, "powershell") === null) shellNeutral++;
}
{
  const unnamed = denies.filter((r) => !r[2]).length + allows.filter((r) => !r[2]).length;
  check(shellNeutral === unnamed, "every row without a named shell decides the same under both shells", `${unnamed - shellNeutral} row(s) depend on the shell`);
}
// The shell decides how a `$(` after a flag is read: in PowerShell it is
// the flag's value, in Bash it is a substitution and the flag is ignored.
{
  const psInFile = 'irm -InFile $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; body="y"}';
  const psTyped = 'irm -InFile $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; type="Bug"}';
  const bashWall = 'gcc -Wall $(pkg-config --cflags "x\\") main.c ; gh issue create --title x';
  check(typeof decide(psInFile, "powershell") === "string", "denied: an untyped irm create after -InFile $( ) under the PowerShell tool");
  check(decide(psTyped, "powershell") === null, "allowed: a typed irm create after -InFile $( ) under the PowerShell tool");
  check(typeof decide(bashWall, "bash") === "string", "denied: a create after gcc -Wall $( ) under the Bash tool");
  check(typeof decide(bashWall, "powershell") === "string", "denied: a create after gcc -Wall $( ) under the PowerShell tool");
  // One text, both shells, in both orders: the bracket map cached for one
  // shell must not answer for the other.
  check(decide(psInFile, "bash") === null && typeof decide(psInFile, "powershell") === "string", "the bracket map cached under Bash is not reused under PowerShell");
  check(typeof decide(psInFile, "powershell") === "string" && decide(psInFile, "bash") === null, "the bracket map cached under PowerShell is not reused under Bash");
  // A string handed to pwsh -Command is PowerShell whatever the outer tool;
  // the text is the one the Bash reading allows above.
  check(typeof decide(`pwsh -Command '${psInFile}'`, "bash") === "string", "denied: an untyped irm create after -InFile $( ) inside pwsh -Command under the Bash tool");
  check(typeof decide(`bash -c '${bashWall}'`, "powershell") === "string", "denied: a create after gcc -Wall $( ) inside bash -c under the PowerShell tool");
  // Without a tool name the command is read both ways and refused if
  // either reading refuses it.
  check(typeof decide(psInFile) === "string", "denied: an untyped irm create after -InFile $( ) with no tool name");
  check(decide(psTyped) === null, "allowed: a typed irm create after -InFile $( ) with no tool name");
  check(typeof decide(bashWall) === "string", "denied: a create after gcc -Wall $( ) with no tool name");
  check(decide(psInFile, "bash") === null && typeof decide(psInFile, "powershell") === "string" && typeof decide(psInFile) === "string", "a text one reading allows and the other refuses is refused with no tool name");
}

// The wired command string, under bash and under a plain POSIX shell.
{
  const settings = JSON.parse(readFileSync(resolve(root, ".claude", "settings.json"), "utf8"));
  const entry = (settings.hooks?.PreToolUse ?? []).find(
    (e) => /\bBash\b/.test(e.matcher) && /\bPowerShell\b/.test(e.matcher),
  );
  const hook = entry?.hooks.find((h) => h.command.includes("typed-issue-hook.mjs"));
  check(Boolean(hook), "settings.json wires typed-issue-hook.mjs for Bash|PowerShell");
  const shells = [process.platform === "win32" ? testShell() : "bash"];
  if (spawnSync("dash", ["-c", "true"], { windowsHide: true }).status === 0) shells.push("dash");
  else console.log("NOTE: dash is not installed; the POSIX-shell pass is skipped");
  for (const shell of shells) {
    const run = (payload, env = {}) =>
      spawnSync(shell, ["-c", hook.command], {
        windowsHide: true,
        input: payload,
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: fixtures.off, ...env },
      });
    const wire = (label, payload, expectDeny, env) => {
      const r = run(payload, env);
      const out = r.stdout ?? "";
      let parsed = null;
      try {
        parsed = out ? JSON.parse(out) : null;
      } catch {}
      const denied = parsed?.hookSpecificOutput?.permissionDecision === "deny";
      const ok = r.status === 0 && !(r.stderr ?? "").trim() && denied === expectDeny && (expectDeny ? typeof parsed.hookSpecificOutput.permissionDecisionReason === "string" : out === "");
      check(ok, `[${shell}] ${expectDeny ? "wired deny" : "wired allow"}: ${label}`, `status=${r.status} stderr=${JSON.stringify(r.stderr)} stdout=${JSON.stringify(out)}`);
    };
    const payload = (tool_name, tool_input) => JSON.stringify({ tool_name, tool_input });
    wire("Bash gh issue create", payload("Bash", { command: "gh issue create --title x", description: "file it" }), true);
    wire("uppercase GH issue create", payload("Bash", { command: "GH issue create --title x" }), true);
    wire("PowerShell untyped implicit POST", payload("PowerShell", { command: "gh api repos/ImpowerGames/impower/issues -f title=x" }), true);
    wire("PowerShell Invoke-RestMethod POST", payload("PowerShell", { command: "Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $b" }), true);
    wire("Bash typed create", payload("Bash", { command: "gh api repos/ImpowerGames/impower/issues -f title=x -f type=Bug" }), false);
    wire("phrase only in the description", payload("Bash", { command: "npm test", description: "check nothing still runs gh issue create" }), false);
    wire("payload without tool_input", payload("Bash", undefined), false);
    wire("pretty-printed multi-line payload", JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh issue create --title x" } }, null, 2), true);
    wire("unparseable payload mentioning gh api", "{not json gh api repos/x/y/issues", true);
    {
      const r = run("{not json gh api repos/x/y/issues");
      const reason = (() => { try { return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason; } catch { return ""; } })();
      check(/could not parse the tool payload.*File it with: gh api -X POST .* # /.test(reason), `[${shell}] the unparseable-payload reason carries the recipe`, JSON.stringify(reason));
    }
    wire("unparseable payload without gh", "{not json", false);
    wire("deny reason survives a percent sign", payload("Bash", { command: "gh issue create --title '100%'" }), true);
    wire("large payload without gh", payload("Bash", { command: "echo " + "x".repeat(200000) }), false);
    wire("large payload with a create at the end", payload("Bash", { command: "echo " + "x".repeat(200000) + "; gh issue create --title x" }), true);
    // One wired case per pre-filter branch, so dropping a branch fails here.
    wire("curl create (curl branch)", payload("Bash", { command: 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -d \'{"title":"x"}\'' }), true);
    wire("irm create (irm branch)", payload("PowerShell", { command: "irm https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body $b" }), true);
    wire("iwr create (iwr branch)", payload("PowerShell", { command: "iwr https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Body $b" }), true);
    wire("uppercase INVOKE-RESTMETHOD create (invoke branch)", payload("PowerShell", { command: "INVOKE-RESTMETHOD -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body $b" }), true);
    wire("CRLF here-doc then a create", payload("Bash", { command: "cat > t.md <<'EOF'\r\n## Summary\r\nEOF\r\ngh issue create --title x" }), true);
    wire("create inside a for loop", payload("Bash", { command: "for i in 1 2; do gh issue create --title x; done" }), true);
    wire("grep -c for the phrase", payload("Bash", { command: "grep -c 'gh issue create' README.md" }), false);
    wire("pwsh -NoProfile -Command create", payload("PowerShell", { command: "pwsh -NoProfile -Command 'gh issue create --title x'" }), true);
    wire("create in a $( ) inside double quotes", payload("Bash", { command: 'N="$(gh issue create --title x)"' }), true);
    wire("clustered curl -sd create", payload("Bash", { command: "curl -sd '{\"title\":\"x\"}' https://api.github.com/repos/ImpowerGames/impower/issues" }), true);
    wire("create after a PowerShell newline escape", payload("PowerShell", { command: 'Write-Host "Done.`n"; gh issue create --title x' }), true);
    wire("PowerShell capture of a create", payload("PowerShell", { command: "$out = gh issue create --title x" }), true);
    wire("create after a leading 2>&1", payload("Bash", { command: "2>&1 gh issue create --title x" }), true);
    // The tool name picks the shell: the same text is a PowerShell flag
    // value under one tool and a Bash substitution under the other.
    wire("untyped irm create after -InFile $( ) under the PowerShell tool", payload("PowerShell", { command: 'irm -InFile $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; body="y"}' }), true);
    wire("typed irm create after -InFile $( ) under the PowerShell tool", payload("PowerShell", { command: 'irm -InFile $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; type="Bug"}' }), false);
    wire("create after gcc -Wall $( ) under the Bash tool", payload("Bash", { command: 'gcc -Wall $(pkg-config --cflags "x\\") main.c ; gh issue create --title x' }), true);
    // The tool name must win over what the text suggests: this Bash command
    // mentions a PowerShell cmdlet, and read as PowerShell its create
    // would vanish into the -Lsf group.
    wire("create after curl -Lsf $( ) in a Bash command that mentions Get-Content", payload("Bash", { command: 'grep -rn Get-Content notes.md ; curl -Lsf $(node -e "console.log(\\"Bearer \\" + t)") https://x ; gh issue create --title x --body-file t.md' }), true);
    // A text the Bash reading allows and the PowerShell reading refuses:
    // allowed under the Bash tool in any spelling, refused with no tool name.
    wire("PowerShell-only text under the Bash tool", payload("Bash", { command: 'irm -InFile $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; body="y"}' }), false);
    wire("PowerShell-only text under the Bash tool named in lower case", payload("bash", { command: 'irm -InFile $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; body="y"}' }), false);
    wire("PowerShell-only text with no tool name", JSON.stringify({ tool_input: { command: 'irm -InFile $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"; body="y"}' } }), true);
    wire("gh issue create with --type Bug", payload("Bash", { command: "gh issue create --title x --body-file t.md --type Bug" }), false);
    wire("create after a path ending in a backslash under the PowerShell tool", payload("PowerShell", { command: 'cd "C:\\out\\" ; gh issue create --title "x" --body-file t.md' }), true);
    wire("typed create after a path ending in a backslash under the PowerShell tool", payload("PowerShell", { command: 'cd "C:\\out\\" ; gh api -X POST repos/ImpowerGames/impower/issues -f title=x -f type=Bug' }), false);
    wire("typed create split over Bash-style backslash lines under the PowerShell tool, whose first line is an untyped POST", payload("PowerShell", { command: "gh api -X POST repos/ImpowerGames/impower/issues \\\n  -f title=x \\\n  -f type=Bug" }), true);
    wire("create whose body file argument ends in a backslash before the type line under the PowerShell tool", payload("PowerShell", { command: "gh api -X POST repos/ImpowerGames/impower/issues -f title=x -F body=@ticket.md\\\n  -f type=Bug" }), true);
    wire("untyped create over backslash lines with a read-only body and no tool name", JSON.stringify({ tool_input: { command: "gh api repos/ImpowerGames/impower/issues \\\n  -f title=x \\\n  -f 'body=the tree is read-only'" } }), true);
    wire("PR comment quoting the phrase in backticks under the PowerShell tool", payload("PowerShell", { command: 'gh pr comment 445 --body "prefer `gh api` over `gh issue create` here"' }), false);
    // The recipe in the deny reason is a runnable line under both tools.
    {
      const r = run(payload("Bash", { command: "gh issue create --title x" }));
      const recipe = JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason.split("instead: ")[1];
      check(typeof recipe === "string" && /^gh api -X POST /.test(recipe) && / # /.test(recipe), `[${shell}] the deny reason ends in the recipe with a comment`, JSON.stringify(recipe));
      const bashRun = spawnSync(process.platform === "win32" ? testShell() : "bash", ["-c", recipe.replace(/^gh /, "echo ")], { encoding: "utf8", windowsHide: true });
      check(bashRun.status === 0 && /^api -X POST/.test(bashRun.stdout), `[${shell}] the recipe line parses under bash`, `status=${bashRun.status} stderr=${JSON.stringify(bashRun.stderr)}`);
      wire("the recipe itself under the PowerShell tool", payload("PowerShell", { command: recipe }), false);
      wire("the recipe itself under the Bash tool", payload("Bash", { command: recipe }), false);
      wire("the recipe without its type under the PowerShell tool", payload("PowerShell", { command: recipe.replace(" -f type=Bug", "") }), true);
    }

    // A wrong project directory must block loudly on a gh command, with a
    // readable reason on stderr, and stay silent on everything else.
    {
      const r = run(payload("Bash", { command: "gh issue create --title x" }), { CLAUDE_PROJECT_DIR: resolve(root, "does-not-exist") });
      check(r.status === 2 && /not found/.test(r.stderr ?? ""), `[${shell}] wrong CLAUDE_PROJECT_DIR blocks a gh command with a readable reason`, `status=${r.status} stderr=${JSON.stringify(r.stderr)}`);
      const r2 = run(payload("Bash", { command: "npm test" }), { CLAUDE_PROJECT_DIR: resolve(root, "does-not-exist") });
      check(r2.status === 0 && !(r2.stderr ?? "").trim() && !r2.stdout, `[${shell}] wrong CLAUDE_PROJECT_DIR is silent on an unrelated command`, `status=${r2.status} stderr=${JSON.stringify(r2.stderr)}`);
    }

    // The same wiring with the switch on: the guard refuses, its allowances
    // pass, and an unparseable payload naming a guarded gh command is refused.
    {
      const onEnv = { CLAUDE_PROJECT_DIR: fixtures.on };
      const wireOn = (label, body, expectDeny) => wire(`switch on: ${label}`, body, expectDeny, onEnv);
      wireOn("gh issue view with no repository", payload("Bash", { command: "gh issue view 12" }), true);
      wireOn("gh pr comment", payload("PowerShell", { command: "gh pr comment 12 --body-file r.md" }), true);
      wireOn("curl read of issue comments", payload("Bash", { command: "curl https://api.github.com/repos/ImpowerGames/impower/issues/12/comments" }), true);
      wireOn("irm read of a review", payload("PowerShell", { command: "irm https://api.github.com/repos/ImpowerGames/impower/pulls/12/reviews" }), true);
      wireOn("gh pr view of permitted fields", payload("Bash", { command: "gh pr view 12 --json number,title,body,isDraft,mergeStateStatus" }), false);
      wireOn("typed create on the internal repository", payload("Bash", { command: "gh issue create --title x --body y --type Task --repo ImpowerGames/impower-internal" }), false);
      wireOn("unparseable payload mentioning gh pr", "{not json gh pr comment 12", true);
      wireOn("unparseable payload without gh", "{not json", false);
    }

    // A repos file the loader rejects fails the check, and the wiring turns
    // that into a refusal of the gh command rather than a pass.
    {
      const r = run(payload("Bash", { command: "gh pr view 12 --json number" }), { CLAUDE_PROJECT_DIR: fixtures.broken });
      check(r.status === 2 && /check itself failed/.test(r.stderr ?? ""), `[${shell}] a malformed repos file refuses a gh command`, `status=${r.status} stderr=${JSON.stringify(r.stderr)}`);
    }

    // The committed checkout decides these the same in either position.
    {
      const rootEnv = { CLAUDE_PROJECT_DIR: root };
      wire("committed repos file: untyped create with no repository", payload("Bash", { command: "gh issue create --title x" }), true, rootEnv);
      wire("committed repos file: gh pr create", payload("Bash", { command: "gh pr create --draft --title x --body-file b.md" }), false, rootEnv);
    }
  }
}

// The repos file and its loader.
{
  const committed = readRepos();
  check(committed.code === "ImpowerGames/impower" && committed.internal === "ImpowerGames/impower-internal" && committed.autolinkPrefix === "I-" && typeof committed.cutover === "boolean", "the repos file names the code and internal repositories, the autolink prefix and the cutover switch", JSON.stringify(committed));
  const bad = (label, text, field) => {
    const file = join(scratch, "bad-repos.json");
    writeFileSync(file, text);
    let message = "";
    try {
      readRepos(file);
    } catch (error) {
      message = error.message;
    }
    check(message.includes(`"${field}"`), `the loader rejects ${label}`, JSON.stringify(message));
  };
  bad("a missing cutover switch", JSON.stringify({ ...OFF, cutover: undefined }), "cutover");
  bad("a cutover switch that is not a boolean", JSON.stringify({ ...OFF, cutover: "false" }), "cutover");
  bad("a code value that is not a slug", JSON.stringify({ ...OFF, code: "impower" }), "code");
  bad("an internal repository equal to the code repository", JSON.stringify({ ...OFF, internal: "impowergames/IMPOWER" }), "internal");
  bad("an autolink prefix without its dash", JSON.stringify({ ...OFF, autolinkPrefix: "I" }), "autolinkPrefix");
  bad("a missing feedback inbox", JSON.stringify({ ...OFF, feedbackInbox: undefined }), "feedbackInbox");
  bad("a feedback inbox that is not an issue number", JSON.stringify({ ...OFF, feedbackInbox: "510" }), "feedbackInbox");
  check(Number.isSafeInteger(committed.feedbackInbox) && committed.feedbackInbox > 0, "the repos file names the feedback inbox issue", JSON.stringify(committed));
  check(ticketsRepo(OFF) === OFF.code && ticketsRepo(ON) === ON.internal, "tickets live in the code repository with the switch off and in the internal one with it on", `${ticketsRepo(OFF)} ${ticketsRepo(ON)}`);
  check(ticketsRepo() === ticketsRepo(committed), "ticketsRepo() reads the committed switch by default", ticketsRepo());
  const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL("../../.agents/repos.mjs", import.meta.url)), ...args], { encoding: "utf8", windowsHide: true });
  const tickets = cli("tickets");
  check(tickets.status === 0 && tickets.stdout.trim() === ticketsRepo(committed), "node .agents/repos.mjs tickets prints the tickets repository", JSON.stringify(tickets));
  const inbox = cli("inbox");
  check(inbox.status === 0 && inbox.stdout.trim() === String(committed.feedbackInbox), "node .agents/repos.mjs inbox prints the inbox number", JSON.stringify(inbox));
  const usage = cli("code");
  check(usage.status === 2 && /Usage/.test(usage.stderr), "node .agents/repos.mjs refuses an unknown value", JSON.stringify(usage));
}

// The public-repository guard, with the switch on. Every row runs the hook
// script itself as the harness would, with a JSON payload on stdin, and
// asserts its exit code and the first line of the reason. The same text must
// decide the same in-process under both shell readings, and with the switch
// off no row reaches the guard.
{
  const guard = (what) => `Public-repository guard: ${what} on ImpowerGames/impower is refused.`;
  const lines = {
    issue: guard("a gh issue command"),
    prComment: guard("gh pr comment"),
    prReview: guard("gh pr review"),
    prEdit: guard("a gh pr edit of labels, assignees, reviewers or projects"),
    prView: guard("a gh pr read of comments or reviews"),
    prList: guard("gh pr list without --author"),
    search: guard("a search of issues or pull requests"),
    api: guard("an issue, comment, review or discussion API call"),
    graphql: "Public-repository guard: a GraphQL query for issues, comments, reviews or discussions of any repository is refused.",
    discussion: guard("a gh discussion command"),
    web: guard("a web page of issues, pull request conversations or discussions"),
  };
  // Typed-creation refusals keep their wording; with the switch on their
  // recipe names the internal repository.
  const internalRecipe = "gh api -X POST repos/ImpowerGames/impower-internal/issues ";
  const typed = {
    typedIssue: "gh issue create without --type leaves the issue untyped, and every ticket here carries one (Bug, Feature, or Task).",
    typedApi: "This creates an issue without an issue type, and every ticket here carries one (Bug, Feature, or Task).",
    typedHttp: "This creates an issue without an issue type (or from a body the hook cannot read).",
    createIssue: "This GraphQL mutation creates an issue, and the hook cannot see whether it sets an issue type.",
    typedBatch: "This curl batch (--next) posts to an issue collection, and the hook cannot tell which transfer carries which body.",
  };
  const code = "ImpowerGames/impower";
  const internal = "ImpowerGames/impower-internal";
  const refusals = [
    // gh issue: every subcommand, named, by placeholder, by URL, by GH_REPO, or with no repository.
    ["gh issue create with no repository", "gh issue create --title x --body y --type Task", "issue"],
    ["gh issue create naming the code repository", `gh issue create --title x --body y --type Task --repo ${code}`, "issue"],
    ["gh issue view with no repository", "gh issue view 12", "issue"],
    ["gh issue view naming the code repository after the number", `gh issue view 12 -R ${code}`, "issue"],
    ["gh issue list naming the code repository before the subcommand", `gh -R ${code} issue list`, "issue"],
    ["gh issue comment", "gh issue comment 12 --body-file c.md", "issue"],
    ["gh issue edit", "gh issue edit 12 --add-label bug", "issue"],
    ["gh issue close", "gh issue close 12", "issue"],
    ["gh issue view by the code repository's URL", `gh issue view https://github.com/${code}/issues/12`, "issue"],
    ["gh issue view with an empty --repo", 'gh issue view 12 --repo ""', "issue"],
    ["gh issue view by a .git URL", `gh issue view 12 --repo https://github.com/${code}.git`, "issue"],
    ["gh issue view with GH_REPO naming the code repository", `GH_REPO=${code} gh issue view 12`, "issue"],
    ["gh issue view with an empty GH_REPO", "GH_REPO= gh issue view 12", "issue"],
    ["gh issue create whose title holds an internal -R", `gh issue create --title "-R ${internal} x" --type Task`, "issue"],
    ["gh issue view inside bash -c", "bash -c 'gh issue view 12'", "issue"],
    ["gh issue view in a substitution", 'T="$(gh issue view 12 --json title)"', "issue"],
    // gh's own repository order: the last repo flag in argument order, and a URL selector over any flag.
    ["gh issue view whose last repo flag is the code repository", `gh issue view 12 --repo ${internal} -R ${code}`, "issue"],
    ["gh issue view with -R internal before the subcommand and the code repository after", `gh -R ${internal} issue view 12 -R ${code}`, "issue"],
    ["gh issue view by the code repository's URL with an internal --repo", `gh issue view https://github.com/${code}/issues/12 --repo ${internal}`, "issue"],
    ["gh pr view --comments by the code repository's URL with an internal -R", `gh pr view https://github.com/${code}/pull/1975 --comments -R ${internal}`, "prView"],
    ["gh pr view --comments by the code repository's URL with a port and an internal -R", `gh pr view https://github.com:443/${code}/pull/1975 --comments -R ${internal}`, "prView"],
    // Any repo flag or positional URL naming the code repository refuses, whatever gh's precedence.
    ["gh issue view whose first repo flag is the code repository", `gh issue view 12 -R ${code} --repo ${internal}`, "issue"],
    ["gh issue view by the internal repository's URL with a code -R", `gh issue view https://github.com/${internal}/issues/12 -R ${code}`, "issue"],
    ["gh pr view --json with --comments=true", "gh pr view 1975 --json title --comments=true", "prView"],
    ["gh pr view --json with --comments=false then --comments", "gh pr view 1975 --json title --comments=false --comments", "prView"],
    // GH_REPO counts only when gh certainly inherits it.
    ["gh issue view after GH_REPO internal and sudo, which resets the environment", `GH_REPO=${internal} sudo gh issue view 12`, "issue"],
    ["gh issue view after GH_REPO internal and env -i", `GH_REPO=${internal} env -i gh issue view 12`, "issue"],
    ["gh issue view in bash -c that unsets an inherited internal GH_REPO", `GH_REPO=${internal} bash -c 'unset GH_REPO; gh issue view 12'`, "issue"],
    ["gh issue view in a substitution that unsets GH_REPO", `GH_REPO=${internal} bash -c 'T=$(unset GH_REPO; gh issue view 12)'`, "issue"],
    // gh discussion, the whole family.
    ["gh discussion view with comments", `gh discussion view 67 --repo ${code} --json body,comments`, "discussion"],
    ["gh discussion list naming the code repository", `gh discussion list --repo ${code}`, "discussion"],
    ["gh discussion comment with no repository", "gh discussion comment 67 --body x", "discussion"],
    ["gh discussion create with no repository", "gh discussion create --title x --body y --category General", "discussion"],
    ["gh discussion view by the code repository's URL", `gh discussion view https://github.com/${code}/discussions/67`, "discussion"],
    // gh's built-in aliases.
    ["gh pr ls without --author", `gh pr ls --repo ${code} --json number,title`, "prList"],
    ["gh issue new on the internal repository without --type", `gh issue new -R ${internal} --title x`, "typedIssue"],
    // gh pr
    ["gh pr comment", "gh pr comment 12 --body-file r.md", "prComment"],
    ["gh pr comment naming the code repository", `gh pr comment 12 -R ${code} --body x`, "prComment"],
    ["gh pr review", "gh pr review 12 --approve", "prReview"],
    // A URL inside an attached flag value is not the selector.
    ["gh pr comment whose attached --body= links an internal issue, before the number", `gh pr comment --body="See https://github.com/${internal}/issues/12" 1975`, "prComment"],
    ["gh pr review whose attached --body= links an internal issue, before the number", `gh pr review --body="See https://github.com/${internal}/issues/12" 1975 --comment`, "prReview"],
    ["gh pr comment whose attached -b links an internal issue", `gh pr comment -b"See https://github.com/${internal}/issues/12" 1975`, "prComment"],
    ["gh issue view whose selector only contains an internal URL", `gh issue view "see https://github.com/${internal}/issues/12"`, "issue"],
    ["gh pr edit --add-label", "gh pr edit 12 --add-label bug", "prEdit"],
    ["gh pr edit --add-label=", "gh pr edit 12 --add-label=bug", "prEdit"],
    ["gh pr edit --remove-label", "gh pr edit 12 --remove-label bug", "prEdit"],
    ["gh pr edit --add-assignee", "gh pr edit 12 --add-assignee @me", "prEdit"],
    ["gh pr edit --add-reviewer", "gh pr edit 12 --add-reviewer someone", "prEdit"],
    ["gh pr edit --add-project", 'gh pr edit 12 --add-project "Language & Engine"', "prEdit"],
    ["gh pr edit --title with --add-label", "gh pr edit 12 --title x --add-label bug", "prEdit"],
    ["gh pr view without --json", "gh pr view 12", "prView"],
    ["gh pr view --comments", "gh pr view 12 --comments", "prView"],
    ["gh pr view -c", "gh pr view 12 -c", "prView"],
    ["gh pr view --json with --comments", "gh pr view 12 --json title --comments", "prView"],
    ["gh pr view --json comments", "gh pr view 12 --json comments", "prView"],
    ["gh pr view --json with reviews among fields", "gh pr view 12 --json number,reviews", "prView"],
    ["gh pr view --json latestReviews", "gh pr view 12 --json latestReviews", "prView"],
    ["gh pr view --json= reviewRequests", "gh pr view 12 --json=title,reviewRequests", "prView"],
    ["gh pr list --author exporting comments and reviews", "gh pr list --author @me --json number,comments,reviews", "prView"],
    ["gh pr status exporting latest reviews", "gh pr status --json number,latestReviews", "prView"],
    ["gh pr list", "gh pr list", "prList"],
    ["gh pr list by head branch only", "gh pr list --head feat/1962-x --json number", "prList"],
    // gh search
    ["gh search issues with no repository", "gh search issues parser crash", "search"],
    ["gh search prs naming the code repository", `gh search prs fix --repo ${code}`, "search"],
    ["gh search issues by repo: qualifier", `gh search issues "repo:${code} crash"`, "search"],
    ["gh search issues by owner only", "gh search issues crash --owner ImpowerGames", "search"],
    ["gh search prs naming both repositories", `gh search prs fix --repo ${internal} --repo ${code}`, "search"],
    ["gh search issues on the internal repository with --owner of the code repository", `gh search issues crash --repo ${internal} --owner ImpowerGames`, "search"],
    ["gh search issues on the internal repository OR the owner", `gh search issues "repo:${internal} OR org:ImpowerGames crash"`, "search"],
    ["gh api search/issues with an OR branch outside the named repository", `gh api -X GET search/issues -f 'q=repo:cli/cli OR "Add the repos file" in:title' -f advanced_search=true`, "search"],
    ["gh search issues with an OR branch outside the internal repository", `gh search issues "repo:${internal} OR crash"`, "search"],
    ["gh api search/issues scoped only by an unrelated field", `gh api -X GET search/issues -f 'q=Add the repos file in:title' -f 'note=repo:ImpowerGames/server'`, "search"],
    ["curl search/issues scoped only by an unrelated parameter", `curl 'https://api.github.com/search/issues?q=crash&note=repo:ImpowerGames/server'`, "search"],
    ["gh search issues with a quoted repo: qualifier for the code repository", `gh search issues 'repo:"${code}" repo:cli/cli'`, "search"],
    ["gh api search/issues with a quoted repo: qualifier for the code repository", `gh api -X GET search/issues -f 'q=repo:"${code}" repo:cli/cli'`, "search"],
    ["gh search issues with a quoted org: qualifier for the code owner", `gh search issues 'repo:${internal} org:"ImpowerGames"'`, "search"],
    ["gh search issues with a comma-separated --repo naming the code repository", `gh search issues crash --repo ${internal},${code}`, "search"],
    ["gh search prs with a comma-separated --owner naming the code owner", `gh search prs fix --repo ${internal} --owner someone,ImpowerGames`, "search"],
    // gh api, every method
    ["gh api issue comments, paginated", `gh api repos/${code}/issues/12/comments --paginate`, "api"],
    ["gh api issues collection", `gh api repos/${code}/issues`, "api"],
    ["gh api one issue", `gh api repos/${code}/issues/12`, "api"],
    ["gh api PATCH of an issue", `gh api -X PATCH repos/${code}/issues/12 -f state=closed`, "api"],
    ["gh api typed create on the code repository", `gh api -X POST repos/${code}/issues -f title=x -f type=Bug`, "api"],
    ["gh api DELETE of an issue comment", `gh api -X DELETE repos/${code}/issues/comments/5`, "api"],
    ["gh api pull request review comments", `gh api repos/${code}/pulls/12/comments`, "api"],
    ["gh api pull request reviews", `gh api repos/${code}/pulls/12/reviews`, "api"],
    ["gh api one review's comments", `gh api repos/${code}/pulls/12/reviews/3/comments`, "api"],
    ["gh api review request", `gh api -X POST repos/${code}/pulls/12/requested_reviewers -f "reviewers[]=x"`, "api"],
    // The path as GitHub resolves it.
    ["gh api with a percent-encoded repository name", `gh api repos/ImpowerGames/%69mpower/issues/1962`, "api"],
    ["gh api with a fragment", `gh api 'repos/${code}/issues#note'`, "api"],
    ["gh api with dot segments", `gh api repos/${code}/pulls/../issues/1`, "api"],
    ["gh api with a doubled slash", `gh api repos/${code}//issues/1`, "api"],
    ["gh api by repository ID", "gh api repositories/123456/issues/1/comments", "api"],
    // Feeds that gather issues or their events across repositories.
    ["gh api issues assigned across repositories", "gh api issues", "api"],
    ["gh api the user's issues", "gh api user/issues", "api"],
    ["gh api the organization's issues", "gh api orgs/ImpowerGames/issues", "api"],
    ["gh api the code repository's events", `gh api repos/${code}/events`, "api"],
    ["gh api the organization's events", "gh api orgs/ImpowerGames/events", "api"],
    ["gh api a user's received events", "gh api users/someone/received_events", "api"],
    ["gh api notifications", "gh api notifications", "api"],
    ["curl the code repository's events", `curl https://api.github.com/repos/${code}/events`, "api"],
    ["gh api repository-wide review comments", `gh api repos/${code}/pulls/comments`, "api"],
    ["gh api one repository-wide review comment", `gh api repos/${code}/pulls/comments/5`, "api"],
    ["gh api discussions", `gh api repos/${code}/discussions`, "api"],
    ["gh api discussion comments", `gh api repos/${code}/discussions/3/comments`, "api"],
    ["gh api by the {owner}/{repo} placeholder", "gh api repos/{owner}/{repo}/issues/12/comments", "api"],
    ["gh api by absolute URL", `gh api https://api.github.com/repos/${code}/issues/12`, "api"],
    ["gh api search/issues by q field", `gh api search/issues -f q="repo:${code} is:open"`, "search"],
    ["gh api search/issues by query string", `gh api "search/issues?q=repo:${code}+crash"`, "search"],
    // GraphQL
    ["GraphQL issues by owner and name", `gh api graphql -f query='query { repository(owner: "ImpowerGames", name: "impower") { issues(first: 5) { nodes { title } } } }'`, "graphql"],
    ["GraphQL pull request comments by variables", "gh api graphql -f owner=ImpowerGames -f name=impower -f query='query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { pullRequest(number: 1) { comments(first: 5) { nodes { body } } } } }'", "graphql"],
    ["GraphQL search by repo qualifier", `gh api graphql -f query='query { search(query: "repo:${code} crash", type: ISSUE, first: 5) { nodes { ... on Issue { title } } } }'`, "graphql"],
    ["GraphQL discussions", `gh api graphql -f query='query { repository(owner: "ImpowerGames", name: "impower") { discussions(first: 1) { nodes { body } } } }'`, "graphql"],
    ["GraphQL pull request timeline", `gh api graphql -f query='query { repository(owner: "ImpowerGames", name: "impower") { pullRequest(number: 1975) { timeline(first: 100) { nodes { ... on IssueComment { body } ... on PullRequestReview { body } } } } } }'`, "graphql"],
    // Entry points that reach issues without naming one repository.
    ["GraphQL search scoped to the organization", `gh api graphql -f query='query { search(query: "org:ImpowerGames is:issue", type: ISSUE, first: 10) { nodes { ... on Issue { body } } } }'`, "graphql"],
    ["GraphQL search with no scope", `gh api graphql -f query='query { search(query: "is:issue crash", type: ISSUE, first: 10) { nodes { ... on Issue { body } } } }'`, "graphql"],
    ["GraphQL node by ID", `gh api graphql -f query='query { node(id: "I_kwDOabc") { ... on Issue { body } } }'`, "graphql"],
    ["GraphQL nodes by IDs", `gh api graphql -f query='query { nodes(ids: ["IC_x"]) { ... on IssueComment { body } } }'`, "graphql"],
    ["GraphQL viewer issues", `gh api graphql -f query='query { viewer { issues(first: 5) { nodes { body } } } }'`, "graphql"],
    ["GraphQL organization repositories' issues", `gh api graphql -f query='query { organization(login: "ImpowerGames") { repositories(first: 5) { nodes { issues(first: 5) { nodes { body } } } } } }'`, "graphql"],
    ["GraphQL comment mutation by subject ID", `gh api graphql -f query='mutation { addComment(input: {subjectId: "PR_x", body: "hi"}) { clientMutationId } }'`, "graphql"],
    ["GraphQL from another repository across its owner to the code repository's issues", "gh api graphql -f owner=ImpowerGames -f name=server -f 'query=query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { owner { ... on Organization { repositories(first: 100) { nodes { issues(first: 1) { nodes { body } } } } } } } }'", "graphql"],
    ["GraphQL viewer issues behind a directive beside another repository", `gh api graphql -f query='query { repository(owner: "ImpowerGames", name: "server") { id } viewer @include(if: true) { issues(first: 1) { nodes { body } } } }'`, "graphql"],
    ["GraphQL from an internal issue's timeline to the issue that referenced it", `gh api graphql -f query='query { repository(owner: "ImpowerGames", name: "impower-internal") { issue(number: 1) { timelineItems(first: 5) { nodes { ... on CrossReferencedEvent { source { ... on Issue { body } } } } } } } }'`, "graphql"],
    ["GraphQL search whose query variable is scoped to the organization", "gh api graphql -F q='org:ImpowerGames' -f query='query($q: String!) { search(query: $q, type: ISSUE, first: 10) { nodes { ... on Issue { body } } } }'", "graphql"],
    ["GraphQL search with a scoped repo: only in an unrelated field", `gh api graphql -f note='repo:${internal}' -f query='query { search(query: "is:issue crash", type: ISSUE, first: 10) { nodes { ... on Issue { body } } } }'`, "graphql"],
    ["GraphQL closing references from an internal pull request", `gh api graphql -f 'query=query { repository(owner: "ImpowerGames", name: "impower-internal") { pullRequest(number: 1) { closingIssuesReferences(first: 5) { nodes { body } } } } }'`, "graphql"],
    ["GraphQL from a fork's pull request to its head repository's issues", `gh api graphql -f query='query { repository(owner: "OtherOwner", name: "fork") { pullRequest(number: 1) { headRepository { issues(first: 5) { nodes { body } } } } } }'`, "graphql"],
    // With the switch on, GraphQL may not read tickets at all, whatever repository it names.
    ["GraphQL search whose query variable is scoped to the internal repository, now refused with any GraphQL ticket read", `gh api graphql -F q='repo:${internal}' -f query='query($q: String!) { search(query: $q, type: ISSUE, first: 10) { nodes { ... on Issue { body } } } }'`, "graphql"],
    ["GraphQL internal issues with their authors, now refused with any GraphQL ticket read", `gh api graphql -f query='query { repository(owner: "ImpowerGames", name: "impower-internal") { issue(number: 1) { body author { login } comments(first: 5) { nodes { body } } } } }'`, "graphql"],
    ["GraphQL search scoped to the internal repository, now refused with any GraphQL ticket read", `gh api graphql -f query='query { search(query: "repo:${internal} is:issue", type: ISSUE, first: 10) { nodes { ... on Issue { body } } } }'`, "graphql"],
    ["GraphQL issues on the internal repository, now refused with any GraphQL ticket read",`gh api graphql -f query='query { repository(owner: "ImpowerGames", name: "impower-internal") { issues(first: 5) { nodes { title } } } }'`, "graphql"],
    ["GraphQL closing issue references", `gh api graphql -f query='query { repository(owner: "ImpowerGames", name: "impower") { pullRequest(number: 1975) { closingIssuesReferences(first: 5) { nodes { body } } } } }'`, "graphql"],
    // curl, Invoke-RestMethod, irm, Invoke-WebRequest, iwr
    ["curl read of issue comments", `curl https://api.github.com/repos/${code}/issues/12/comments`, "api"],
    ["curl review POST", `curl -X POST https://api.github.com/repos/${code}/pulls/12/reviews -d '{"event":"APPROVE"}'`, "api"],
    ["curl issues search", `curl "https://api.github.com/search/issues?q=repo:${code}+crash"`, "search"],
    ["curl GraphQL issues", `curl -X POST https://api.github.com/graphql -d '{"query":"query { repository(owner: \\"ImpowerGames\\", name: \\"impower\\") { issues(first: 1) { nodes { title } } } }"}'`, "graphql", "bash"],
    ["Invoke-RestMethod read of an issue", `Invoke-RestMethod -Uri https://api.github.com/repos/${code}/issues/12`, "api"],
    ["irm read of discussions", `irm https://api.github.com/repos/${code}/discussions`, "api"],
    ["Invoke-WebRequest read of review requests", `Invoke-WebRequest -Uri https://api.github.com/repos/${code}/pulls/12/requested_reviewers`, "api"],
    ["iwr read of the issues collection", `iwr https://api.github.com/repos/${code}/issues`, "api"],
    // URL syntax: user information, curl globs, and web pages.
    ["curl read with user information in the URL", `curl https://reader@api.github.com/repos/${code}/issues/1962`, "api"],
    ["curl read through a brace glob that expands to the code repository", `curl 'https://api.github.com/repos/ImpowerGames/{impower,server}/issues/1962'`, "api"],
    ["curl read through a bracket glob", `curl 'https://api.github.com/repos/${code}/issues/[1-9]'`, "api"],
    ["curl glob after an attached option value holding g", `curl -Aagent 'https://api.github.com/repos/ImpowerGames/{impower,server}/issues/1962'`, "api"],
    ["curl glob in the host", `curl 'https://{api.github.com,example.com}/repos/${code}/issues/1962'`, "api"],
    ["curl range in the host", `curl 'https://[a-b]pi.github.com/repos/${code}/issues/1962'`, "api"],
    ["curl glob around whole URLs", `curl '{https://api.github.com/repos/${code}/issues/1,https://example.com}'`, "api"],
    ["curl range in the repository name", `curl 'https://api.github.com/repos/ImpowerGames/[a-i]mpower/issues/1962'`, "api"],
    ["curl glob whose query string holds a quoted value", `curl 'https://api.github.com/repos/ImpowerGames/{impower,server}/issues/1?note="x"'`, "api"],
    ["curl read whose query string holds a quoted value", `curl 'https://api.github.com/repos/${code}/issues/1?note="x"'`, "api"],
    ["curl read whose query string holds a space", `curl 'https://api.github.com/repos/${code}/issues/1?note=a b'`, "api"],
    ["Invoke-RestMethod read whose query string holds a quote", `Invoke-RestMethod -Uri 'https://api.github.com/repos/${code}/issues/1?note="x"'`, "api", "powershell"],
    ["curl host glob whose query string holds a quoted value", `curl 'https://{api.github.com,example.com}/repos/${code}/issues/1962?note="x"'`, "api"],
    ["curl glob around whole URLs whose query holds a quoted value", `curl '{https://api.github.com/repos/${code}/issues/1,https://example.com}?note="x"'`, "api"],
    ["curl glob with globbing off",`curl -g'https://api.github.com/repos/ImpowerGames/{impower,server}/pulls/1'`, "api"],
    ["curl of the code repository's issue page", `curl -L https://github.com/${code}/issues/1962`, "web"],
    ["curl of the code repository's pull request conversation page", `curl https://github.com/${code}/pull/1975`, "web"],
    ["curl of the code repository's discussions page", `curl https://github.com/${code}/discussions`, "web"],
    ["Invoke-WebRequest of the code repository's issue page", `Invoke-WebRequest -Uri https://github.com/${code}/issues/1962`, "web", "powershell"],
    ["iwr of a pull request's review comments page", `iwr https://www.github.com/${code}/pull/1975/files`, "web"],
    // An attached method value does not take the URL after it.
    ["curl -XGET read of issue comments", `curl -XGET https://api.github.com/repos/${code}/issues/12/comments`, "api"],
    ["curl -XPOST review", `curl -XPOST https://api.github.com/repos/${code}/pulls/12/reviews -d '{"event":"APPROVE"}'`, "api"],
    ["curl clustered -sSLXGET read", `curl -sSLXGET https://api.github.com/repos/${code}/issues/12`, "api"],
    // Every argument that is wholly an API URL is a destination, whatever precedes it.
    ["curl read after -d consumed -X", `curl -d -X https://api.github.com/repos/${code}/issues/12/comments`, "api"],
    ["curl read after -A consumed -X", `curl -A -X https://api.github.com/repos/${code}/issues/12/comments`, "api"],
    ["curl read whose URL has a fragment", `curl https://api.github.com/repos/${code}/issues/12/comments#top`, "api"],
    ["Invoke-RestMethod read whose URL has a fragment", `Invoke-RestMethod -Uri https://api.github.com/repos/${code}/issues/12/comments#top`, "api", "powershell"],
    ["curl read with an explicit port", `curl https://api.github.com:443/repos/${code}/issues/12`, "api"],
    ["curl read through --url=", `curl --url=https://api.github.com/repos/${code}/issues/12`, "api"],
    ["irm read through -Uri:", `irm -Uri:https://api.github.com/repos/${code}/issues/12`, "api", "powershell"],
    ["curl comment POST whose body links a pull request", `curl -X POST https://api.github.com/repos/${code}/issues/1/comments -d '{"body":"see https://api.github.com/repos/${code}/pulls/2"}'`, "api"],
    ["Invoke-RestMethod GraphQL reviews", `Invoke-RestMethod -Method Post -Uri https://api.github.com/graphql -Body (@{query='query { repository(owner: "ImpowerGames", name: "impower") { pullRequest(number: 1) { reviews(first: 5) { nodes { body } } } } }'} | ConvertTo-Json)`, "graphql"],
    // Typed creation, now scoped to the internal repository.
    ["gh issue create on the internal repository without --type", `gh issue create --title x --body y --repo ${internal}`, "typedIssue"],
    ["gh issue create with -R internal before the subcommand without --type", `gh -R ${internal} issue create --title x`, "typedIssue"],
    ["gh issue create with GH_REPO internal without --type", `GH_REPO=${internal} gh issue create --title x`, "typedIssue"],
    ["gh issue create inheriting GH_REPO internal in bash -c without --type", `GH_REPO=${internal} bash -c 'gh issue create --title x'`, "typedIssue"],
    ["gh api create on the internal repository without type", `gh api -X POST repos/${internal}/issues -f title=x -F body=@b.md`, "typedApi"],
    ["curl create on the internal repository without type", `curl -X POST https://api.github.com/repos/${internal}/issues -d '{"title":"x"}'`, "typedHttp"],
    ["irm create on the internal repository without type", `irm -Method Post -Uri https://api.github.com/repos/${internal}/issues -Body @{title='x'}`, "typedHttp"],
    ["curl create posting to another repository and the internal one without type", `curl -X POST https://api.github.com/repos/SomeOther/repo/issues https://api.github.com/repos/${internal}/issues -d '{"title":"x"}'`, "typedHttp"],
    ["curl create through a glob holding the internal repository", `curl -X POST 'https://api.github.com/repos/ImpowerGames/{server,impower-internal}/issues' -d '{"title":"x"}'`, "api"],
    ["curl batch whose typed first transfer goes elsewhere and untyped second to the internal repository", `curl -X POST https://api.github.com/repos/SomeOther/repo/issues -d '{"title":"x","type":"Task"}' --next -X POST https://api.github.com/repos/${internal}/issues -d '{"title":"x"}'`, "typedBatch"],
    ["curl batch with -: to the internal repository", `curl -X POST https://api.github.com/repos/${internal}/issues -d '{"title":"x","type":"Task"}' -: -X POST https://api.github.com/repos/${internal}/issues -d '{"title":"y"}'`, "typedBatch"],
    ["curl create on the internal repository through a port without type", `curl -X POST https://api.github.com:443/repos/${internal}/issues --data '{"title":"x"}'`, "typedHttp"],
    ["irm create on a percent-encoded internal repository without type", `irm -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower-%69nternal/issues -Body '{"title":"x"}'`, "typedHttp", "powershell"],
    ["GraphQL createIssue on the internal repository", "gh api graphql -f query='mutation { createIssue(input: {repositoryId: \"x\", title: \"y\"}) { issue { id } } }'", "createIssue"],
  ];
  const allowances = [
    ["gh pr create --draft", "gh pr create --draft --title x --body-file b.md"],
    ["gh pr ready", "gh pr ready 12"],
    ["gh pr ready --undo", "gh pr ready 12 --undo"],
    ["gh pr checks", "gh pr checks 12"],
    ["gh pr diff", "gh pr diff 12"],
    ["gh pr merge", "gh pr merge 12 --squash"],
    ["gh pr list --author", "gh pr list --author @me --head feat/1962-x --json number,url"],
    ["gh pr list -A", "gh pr list -A @me"],
    ["gh pr view --json of permitted fields", "gh pr view 12 --json number,title,body,isDraft,mergeStateStatus"],
    ["gh pr view --json= of a permitted field", "gh pr view 12 --json=headRefName"],
    ["gh pr edit --title", "gh pr edit 12 --title x"],
    ["gh pr edit --body", "gh pr edit 12 --body x"],
    ["gh pr edit --body-file", "gh pr edit 12 --body-file b.md"],
    ["gh run list", "gh run list --branch feat/1962-x"],
    ["gh run view --log-failed", "gh run view 5 --log-failed"],
    ["gh api one pull request", `gh api repos/${code}/pulls/12 --jq .body`],
    ["gh api pull request files", `gh api repos/${code}/pulls/12/files`],
    ["gh api commits", `gh api repos/${code}/commits/abc123`],
    ["gh api branches", `gh api repos/${code}/branches/main/protection`],
    ["gh api rulesets", `gh api repos/${code}/rulesets`],
    ["gh api Actions", `gh api repos/${code}/actions/runs/5/jobs`],
    ["gh api git data", `gh api repos/${code}/git/refs/heads/main`],
    ["gh api contents", `gh api repos/${code}/contents/README.md`],
    ["gh api one pull request by placeholder", "gh api repos/{owner}/{repo}/pulls/12"],
    ["curl Actions runs", `curl https://api.github.com/repos/${code}/actions/runs`],
    ["irm one pull request", `irm https://api.github.com/repos/${code}/pulls/12`],
    ["gh issue view on the internal repository", `gh issue view 12 -R ${internal}`],
    ["gh issue list on the internal repository", `gh issue list --repo ${internal} --label bug`],
    ["gh issue comment on the internal repository", `gh issue comment 12 -R ${internal} --body-file c.md`],
    ["gh issue view by the internal repository's URL", `gh issue view https://github.com/${internal}/issues/12`],
    ["gh issue view with GH_REPO naming the internal repository", `GH_REPO=${internal} gh issue view 12`],
    ["gh issue view with GH_REPO internal among other assignments", `X=1 GH_REPO=${internal} Y=2 gh issue view 12`],
    ["gh issue view with GH_REPO internal given to env", `env GH_REPO=${internal} gh issue view 12`],
    ["gh issue view in bash -c inheriting GH_REPO internal", `GH_REPO=${internal} bash -c 'gh issue view 12'`],
    ["gh issue view in pwsh -Command inheriting GH_REPO internal", `GH_REPO=${internal} pwsh -NoProfile -Command 'gh issue view 12'`],
    ["gh issue view whose repo flags are both the internal repository", `gh issue view 12 -R ${internal} --repo=${internal}`],
    ["gh issue view by the internal repository's URL with an internal -R", `gh issue view https://github.com/${internal}/issues/12 -R ${internal}`],
    ["gh issue comment whose body links the code repository", `gh issue comment 12 -R ${internal} --body "see https://github.com/${code}/issues/1"`],
    ["gh issue view after GH_REPO internal and a redirection", `GH_REPO=${internal} > /dev/null gh issue view 12`, "bash"],
    ["gh issue view after GH_REPO internal and nohup", `GH_REPO=${internal} nohup gh issue view 12`, "bash"],
    ["gh issue view through a flagless env in bash -c inheriting GH_REPO internal", `GH_REPO=${internal} bash -c 'env gh issue view 12'`, "bash"],
    ["gh pr view --json with --comments=false", "gh pr view 1975 --json title --comments=false"],
    ["gh pr view --json with -c=false", "gh pr view 1975 --json title -c=false"],
    ["GraphQL pull request state under an operation name holding review", `gh api graphql -f query='query ReviewTitle { repository(owner: "ImpowerGames", name: "impower") { pullRequest(number: 1975) { title isDraft } } }'`],
    ["GraphQL pull request state under an alias and a variable holding review", `gh api graphql -F reviewNumber=1975 -f query='query($reviewNumber: Int!) { repository(owner: "ImpowerGames", name: "impower") { pullRequest(number: $reviewNumber) { reviewish: title } } }'`],
    ["curl PATCH of a pull request body that links an issue", `curl https://api.github.com/repos/${code}/pulls/1975 -X PATCH -d '{"body":"See https://api.github.com/repos/${code}/issues/1962"}'`],
    ["Invoke-RestMethod PATCH of a pull request body that links an issue", `Invoke-RestMethod -Uri https://api.github.com/repos/${code}/pulls/1975 -Method Patch -Body @{body='See https://api.github.com/repos/${code}/issues/1962'}`, "powershell"],
    ["typed gh issue create on the internal repository", `gh issue create --title x --body y --type Task --repo ${internal}`],
    ["typed gh api create on the internal repository", `gh api -X POST repos/${internal}/issues -f title=x -F body=@b.md -f type=Task`],
    ["gh api comments on the internal repository", `gh api repos/${internal}/issues/12/comments --paginate`],
    ["gh search issues on the internal repository", `gh search issues crash --repo ${internal}`],
    ["gh search issues by internal repo: qualifier", `gh search issues "repo:${internal} crash"`],
    ["gh discussion list on the internal repository", `gh discussion list --repo ${internal}`],
    ["gh pr ls --author", "gh pr ls --author @me --json number"],
    ["gh api search/issues scoped by its q", `gh api -X GET search/issues -f 'q=repo:${internal} crash'`],
    ["curl search/issues scoped by its q", `curl 'https://api.github.com/search/issues?q=repo:${internal}+crash'`],
    ["curl PATCH of a pull request body holding braces, brackets and GitHub links", `curl https://api.github.com/repos/${code}/pulls/1975 -X PATCH -d '{"body":"See https://github.com/${code}/issues/{1,2} and [x]"}'`],
    ["curl of a code repository archive", `curl -L https://github.com/${code}/archive/main.zip`],
    ["curl of the code repository's pull request list page", `curl https://github.com/${code}/pulls`],
    ["gh pr list --author exporting permitted fields", "gh pr list --author @me --json number,title,headRefName,isDraft"],
    ["gh api a percent-encoded pull request on the code repository", `gh api repos/${code}/pulls/%31975`],
    ["gh api the internal repository's events", `gh api repos/${internal}/events`],
    ["gh api a percent-encoded internal issue", `gh api repos/ImpowerGames/impower-%69nternal/issues/12`],
    ["GraphQL pull request state on the code repository", `gh api graphql -f query='query { repository(owner: "ImpowerGames", name: "impower") { pullRequest(number: 1) { title isDraft } } }'`],
    ["untyped create on another repository", "gh api -X POST repos/SomeOther/repo/issues -f title=x"],
    ["gh repo view", "gh repo view --json name"],
    ["a commit message naming a guarded command", 'git commit -m "docs: never run gh issue view 12 here"'],
  ];

  const script = join(fixtures.on, ".claude/hooks/typed-issue-hook.mjs");
  const runHook = (command, shell) =>
    spawnSync(process.execPath, [script], {
      windowsHide: true,
      input: JSON.stringify({ tool_name: shell === "powershell" ? "PowerShell" : "Bash", tool_input: { command } }),
      encoding: "utf8",
    });
  const reasonOf = (r) => {
    try {
      return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason;
    } catch {
      return null;
    }
  };
  const firstLine = (reason) => (typeof reason === "string" ? reason.split("\n")[0] : reason);
  const expectLine = (key, line) =>
    key in lines ? line === lines[key] : typeof line === "string" && line.startsWith(typed[key]) && (key === "createIssue" || line.includes(internalRecipe));
  const covered = new Set();
  for (const [label, command, key, shell] of refusals) {
    covered.add(key);
    const r = runHook(command, shell);
    const line = firstLine(reasonOf(r));
    check(r.status === 0 && !(r.stderr ?? "").trim() && expectLine(key, line), `switch on, refused (${key}): ${label}`, `status=${r.status} stderr=${JSON.stringify(r.stderr)} first line=${JSON.stringify(line)}`);
    const both = firstLine(decideWith(command, shell, { repos: ON }));
    check(both === line, `switch on, the in-process decision matches the hook: ${label}`, JSON.stringify(both));
    const off = decideWith(command, shell, { repos: OFF });
    check(!(typeof off === "string" && off.startsWith("Public-repository guard")), `switch off, no guard: ${label}`, JSON.stringify(off));
  }
  check(Object.keys(lines).every((k) => covered.has(k)) && Object.keys(typed).every((k) => covered.has(k)), "every refusal reason has a row");
  for (const [label, command, shell] of allowances) {
    const r = runHook(command, shell);
    check(r.status === 0 && !(r.stderr ?? "").trim() && r.stdout === "", `switch on, allowed: ${label}`, `status=${r.status} stderr=${JSON.stringify(r.stderr)} stdout=${JSON.stringify(r.stdout)}`);
    check(decideWith(command, shell, { repos: ON }) === null, `switch on, allowed in-process under both readings: ${label}`);
  }
  // The guard's own passes stay linear on large commands.
  {
    const timed = (label, command, shell) => {
      const t0 = Date.now();
      decideWith(command, shell, { repos: ON });
      check(Date.now() - t0 < 2000, `switch on, ${label} decides in under 2 s`, `${Date.now() - t0} ms`);
    };
    timed("a 400 KB pull request body holding 8000 API links", `curl https://api.github.com/repos/${code}/pulls/1 -X PATCH -d '{"body":"${"see https://api.github.com/repos/x/y/issues/1 ".repeat(8000)}"}'`);
    timed("a 300 KB GraphQL query", `gh api graphql -f query='query { ${"a: repository(owner: \"x\", name: \"y\") { id } ".repeat(6000)} }'`);
    timed("20000 gh flags and assignments", "X=1 ".repeat(10000) + "gh pr edit 1 " + "--title x ".repeat(10000));
    timed("a 300 KB search query", `gh search issues "${"repo:a/b ".repeat(30000)}"`);
  }
  // The detail lines name the internal repository and the public contract.
  const reason = decideWith("gh issue view 12", "bash", { repos: ON });
  check(reason.includes(`live in ${internal}`) && /opens a pull request as a draft, pushes to it and marks it ready or back to draft, nothing else/.test(reason) && reason.includes(`-R ${internal}`), "the guard's reason names the internal repository and the public contract", JSON.stringify(reason));
  // With the switch off, the commands the guard would refuse pass as today.
  for (const command of ["gh issue view 12", "gh pr comment 12 --body x", "gh pr view 12 --comments", `gh api repos/${code}/issues/12/comments --paginate`, `gh issue create --title x --body y --type Task --repo ${code}`]) {
    check(decideWith(command, undefined, { repos: OFF }) === null, `switch off, allowed as today: ${command}`);
  }
  check(typeof decideWith(`gh api -X POST repos/${internal}/issues -f title=x`, undefined, { repos: OFF }) !== "string", "switch off, an untyped create on the internal repository passes as today");
}

rmSync(scratch, { recursive: true, force: true });

if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("all checks passed");
