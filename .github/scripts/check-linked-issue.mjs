// Checks that a pull request body links the issue it resolves in a form GitHub
// acts on, or says explicitly that there is none.
//
// GitHub closes an issue when a merged pull request's body contains a closing
// keyword followed by the issue reference: "Closes #12", "Fixes #12",
// "Resolves owner/repo#12", or the full issue URL. The keyword in the title,
// or a bare "#12" mention, closes nothing, which is how tickets end up open
// after their fix has shipped. The template under .github/ carries a
// "Closes #" line for this; the escape hatch is the sentence "No linked issue."
//
// Usage: node .github/scripts/check-linked-issue.mjs
// Reads the body from the PR_BODY environment variable. Exit 0 when the body
// passes, 1 when it does not; the reason is printed either way.

const CLOSING =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+|[\w.-]+\/[\w.-]+#\d+|#\d+)\b/i;
const NO_ISSUE = /\bno linked issue\b/i;

export function checkLinkedIssue(body) {
  // Anything inside an HTML comment is invisible to GitHub's linker as well,
  // and the template's own comments mention the keyword.
  const visible = (body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const closing = visible.match(CLOSING);
  if (closing) {
    return { ok: true, reason: `found closing reference "${closing[0]}"` };
  }
  if (NO_ISSUE.test(visible)) {
    return { ok: true, reason: 'body says "No linked issue."' };
  }
  return {
    ok: false,
    reason:
      'no closing reference found. Add a line such as "Closes #123" to the pull request body (the keyword and the number together; the title does not count), or write "No linked issue." if this change resolves no issue.',
  };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const result = checkLinkedIssue(process.env.PR_BODY);
  console.log(`${result.ok ? "PASS" : "FAIL"}: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}
