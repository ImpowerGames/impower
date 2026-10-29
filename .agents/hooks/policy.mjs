import { decide as typedIssue } from "./typed-issue-hook.mjs";
import { decide as sharedStash } from "./shared-stash-hook.mjs";
import { decide as localTest } from "./local-test-hook.mjs";
import { decide as worktreeCleanup } from "./worktree-cleanup.mjs";
import { controlByteReason, dotNetRelativePathReason, jqQuoteReason } from "./write-hazards.mjs";
import { generatedFile, introducedCommentReason } from "./comment-policy.mjs";

export { generatedFile };

export const generatedReason = "This file is generated from a YAML source under definitions/yaml/. Edit the matching YAML source, then regenerate both output locations with: cd definitions && npm run language";

// Undefined shell means both supported shell readings must allow the command.
export function decide(request) {
  if (request.kind === "edit") return request.paths.some(generatedFile) ? generatedReason : controlByteReason(request.contents ?? []) ?? introducedCommentReason(request.files, request.cwd);
  if (request.kind === "shell") return typedIssue(request.command, request.shell) ?? sharedStash(request.command, request.shell) ?? localTest(request.command, request.shell, request.cwd) ?? worktreeCleanup(request.command, request.shell, request.cwd) ?? (request.shell === "bash" ? null : dotNetRelativePathReason(request.command) ?? (request.shell === "powershell" ? jqQuoteReason(request.command) : null));
  return null;
}
