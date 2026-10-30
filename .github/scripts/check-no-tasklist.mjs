import { pathToFileURL } from "node:url";

const TASKLIST = /^[ \t]*(?:[-+*]|\d+[.)])\s+\[[ xX]\]/m;

export function findTaskList(body) {
  const visible = (body ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "");
  const match = visible.match(TASKLIST);
  return match ? match[0] : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
