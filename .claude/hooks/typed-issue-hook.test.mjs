// Exercises the typed-issue hook two ways: the decision table runs against
// decide() directly, and a set of payloads run through the literal
// PreToolUse "command" string that .claude/settings.json ships, under bash
// and, when one is installed, under dash as a plain POSIX shell, with
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
  ["create in a backquote inside double quotes", 'N="`gh issue create --title x`"'],
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
  ["typed create, multi-line with --jq", "gh api -X POST repos/ImpowerGames/impower/issues \\\n  -f title=x -f type=Bug \\\n  --jq '{number, url: .html_url, type: .type.name}'"],
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
  ["a view inside a double-quoted $( )", 'echo "issue: $(gh issue view 443 --json title)"'],
  ["curl -G with query data", "curl -G -d labels=bug https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl -sSL GET", "curl -sSL https://api.github.com/repos/ImpowerGames/impower/issues"],
  ["curl typed with a Content-Type header", 'curl -X POST https://api.github.com/repos/ImpowerGames/impower/issues -H "Content-Type: application/json" -d \'{"title":"x","type":"Bug"}\''],
  ["Invoke-RestMethod typed with a quoted Content-Type header key", "Invoke-RestMethod -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Method Post -Headers @{'Content-Type'='application/json'} -Body '{\"title\":\"x\",\"type\":\"Bug\"}'"],
  ["Invoke-RestMethod typed hashtable body with spaces", "Invoke-RestMethod -Method POST -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body (@{ title = 'x'; type = 'Bug' } | ConvertTo-Json)"],
  ["pwsh -NoProfile -Command with a view", "pwsh -NoProfile -Command 'gh issue view 443'"],
  ["grep -c after a shell name elsewhere in the command", "bash script.sh && grep -c 'gh issue create' README.md"],
  ["a C++ file written through a terminated here-doc", "cat > f.cpp <<'EOF'\nstd::cout << a << b;\nstd::cout << c;\nEOF\ngh issue view 443"],
  ["empty command", ""],
];

// The here-doc and command-position passes must stay linear: a large command
// full of `<<` operators, and a segment of many assignments, both decide fast.
{
  const many = Array.from({ length: 10000 }, () => "std::cout << a << b;").join("\n");
  let t0 = Date.now();
  decide(many);
  check(Date.now() - t0 < 2000, "10000 lines of << operators decide in under 2 s", `${Date.now() - t0} ms`);
  const assigns = Array.from({ length: 50000 }, (_, i) => `A${i}=1`).join(" ") + " gh issue create --title x";
  t0 = Date.now();
  const r = decide(assigns);
  check(typeof r === "string" && Date.now() - t0 < 2000, "50000 assignments before a create decide in under 2 s", `${Date.now() - t0} ms, ${JSON.stringify(r)?.slice(0, 40)}`);
}

for (const [label, command] of denies) {
  const reason = decide(command);
  check(typeof reason === "string" && reason.includes("type=Bug"), `denied: ${label}`, `got ${JSON.stringify(reason)}`);
}
for (const [label, command] of allows) {
  const reason = decide(command);
  check(reason === null, `allowed: ${label}`, `got ${JSON.stringify(reason)}`);
}

// The wired command string, under bash and under a plain POSIX shell.
{
  const settings = JSON.parse(readFileSync(resolve(root, ".claude", "settings.json"), "utf8"));
  const entry = (settings.hooks?.PreToolUse ?? []).find(
    (e) => /\bBash\b/.test(e.matcher) && /\bPowerShell\b/.test(e.matcher),
  );
  const hook = entry?.hooks.find((h) => h.command.includes("typed-issue-hook.mjs"));
  check(Boolean(hook), "settings.json wires typed-issue-hook.mjs for Bash|PowerShell");
  const shells = ["bash"];
  if (spawnSync("dash", ["-c", "true"]).status === 0) shells.push("dash");
  else console.log("NOTE: dash is not installed; the POSIX-shell pass is skipped");
  for (const shell of shells) {
    const run = (payload, env = {}) =>
      spawnSync(shell, ["-c", hook.command], {
        input: payload,
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
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

    // A wrong project directory must block loudly on a gh command, with a
    // readable reason on stderr, and stay silent on everything else.
    {
      const r = run(payload("Bash", { command: "gh issue create --title x" }), { CLAUDE_PROJECT_DIR: resolve(root, "does-not-exist") });
      check(r.status === 2 && /not found/.test(r.stderr ?? ""), `[${shell}] wrong CLAUDE_PROJECT_DIR blocks a gh command with a readable reason`, `status=${r.status} stderr=${JSON.stringify(r.stderr)}`);
      const r2 = run(payload("Bash", { command: "npm test" }), { CLAUDE_PROJECT_DIR: resolve(root, "does-not-exist") });
      check(r2.status === 0 && !(r2.stderr ?? "").trim() && !r2.stdout, `[${shell}] wrong CLAUDE_PROJECT_DIR is silent on an unrelated command`, `status=${r2.status} stderr=${JSON.stringify(r2.stderr)}`);
    }
  }
}

if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("all checks passed");
