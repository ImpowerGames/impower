// Detects GitHub Flavored Markdown task-list syntax — "- [ ]", "* [x]",
// "+ [ ]", "1. [ ]", "2) [x]", and their indented forms — in a body of
// markdown text. GitHub renders any of these as a checkbox and shows a
// "n of m tasks" counter wherever the containing issue or pull request is
// listed, even after it is finished (see #465). HTML comments and fenced
// code blocks are stripped first, since GitHub renders neither as a task
// list, so a mention of the syntax inside documentation doesn't false-positive.
//
// Usage: node .github/scripts/check-no-tasklist.mjs
// Reads the body from the PR_BODY environment variable. Exit 0 when the body
// carries no task-list syntax, 1 when it does; the reason is printed either way.

const TASKLIST = /^[ \t]*(?:[-+*]|\d+[.)])\s+\[[ xX]\]/m;

export function findTaskList(body) {
  const visible = (body ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "");
  const match = visible.match(TASKLIST);
  return match ? match[0] : null;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const found = findTaskList(process.env.PR_BODY);
  if (found) {
    console.log(
      `FAIL: found task-list syntax ${JSON.stringify(found)} — GitHub renders this as a checkbox and shows a task counter wherever this is listed (see #465). Use plain text instead.`,
    );
    process.exit(1);
  }
  console.log("PASS: no task-list syntax found");
  process.exit(0);
}
