import { decide as typedIssue } from "./typed-issue-hook.mjs";
import { decide as sharedStash } from "./shared-stash-hook.mjs";

export function generatedFile(file) {
  return typeof file === "string" && /(?:^|\/)language\/sparkdown\.language-(?:grammar|config|snippets)\.json$/i.test(file.replaceAll("\\", "/"));
}

export const generatedReason = "This file is generated from a YAML source under definitions/yaml/. Edit the matching YAML source, then regenerate both output locations with: cd definitions && npm run language";

// Undefined shell means both supported shell readings must allow the command.
export function decide(request) {
  if (request.kind === "edit") return request.paths.some(generatedFile) ? generatedReason : null;
  if (request.kind === "shell") return typedIssue(request.command, request.shell) ?? sharedStash(request.command, request.shell);
  return null;
}
