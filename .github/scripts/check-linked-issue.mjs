import { pathToFileURL } from "node:url";
import { readRepos } from "../../.agents/repos.mjs";

const CLOSING =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/\d+|([\w.-]+\/[\w.-]+)#\d+|#\d+)\b/gi;
const NO_ISSUE = /\bno linked issue\b/i;

export function checkLinkedIssue(body, repos = readRepos()) {
  const visible = (body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const references = [...visible.matchAll(CLOSING)];
  const internal = repos.internal.toLowerCase();
  const closing = repos.cutover ? references.find((m) => (m[1] ?? m[2])?.toLowerCase() === internal) : references[0];
  if (closing) {
    return { ok: true, reason: `found closing reference "${closing[0]}"` };
  }
  if (NO_ISSUE.test(visible)) {
    return { ok: true, reason: 'body says "No linked issue."' };
  }
  if (repos.cutover) {
    return {
      ok: false,
      reason: `no closing reference to ${repos.internal} found${references.length ? ` (found ${references.map((m) => `"${m[0]}"`).join(", ")}, which name${references.length === 1 ? "s" : ""} no issue there)` : ""}. Tickets live in ${repos.internal}: add a line such as "Closes ${repos.internal}#123" to the pull request body (the keyword and the reference together; the title does not count), or write "No linked issue." if this change resolves no issue.`,
    };
  }
  return {
    ok: false,
    reason:
      'no closing reference found. Add a line such as "Closes #123" to the pull request body (the keyword and the number together; the title does not count), or write "No linked issue." if this change resolves no issue.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkLinkedIssue(process.env.PR_BODY);
  console.log(`${result.ok ? "PASS" : "FAIL"}: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}
