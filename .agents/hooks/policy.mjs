import { decide as typedIssue } from "./typed-issue-hook.mjs";
import { decide as sharedStash } from "./shared-stash-hook.mjs";
import { decide as maintainerRequest } from "./maintainer-request-hook.mjs";
import { decide as localTest } from "./local-test-hook.mjs";
import { decide as worktreeCleanup } from "./worktree-cleanup.mjs";
import { controlByteReason, dotNetRelativePathReason, jqQuoteReason } from "./write-hazards.mjs";
import { generatedFileReason, introducedCommentReason } from "./comment-policy.mjs";

export { generatedFile, generatedReason } from "./comment-policy.mjs";

export function decide(request) {
  if (request.kind === "edit") {
    for (const file of request.paths) {
      const reason = generatedFileReason(file);
      if (reason) return reason;
    }
    return controlByteReason(request.contents ?? []) ?? introducedCommentReason(request.files, request.cwd);
  }
  if (request.kind === "shell") return typedIssue(request.command, request.shell) ?? maintainerRequest(request.command, request.shell, { cwd: request.cwd }) ?? sharedStash(request.command, request.shell) ?? localTest(request.command, request.shell, request.cwd) ?? worktreeCleanup(request.command, request.shell, request.cwd) ?? (request.shell === "bash" ? null : dotNetRelativePathReason(request.command) ?? (request.shell === "powershell" ? jqQuoteReason(request.command) : null));
  return null;
}
