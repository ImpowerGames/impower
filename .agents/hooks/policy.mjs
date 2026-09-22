import { decide as typedIssue } from "./typed-issue-hook.mjs";
import { decide as sharedStash } from "./shared-stash-hook.mjs";
import { decide as localTest } from "./local-test-hook.mjs";
import { controlByteReason, dotNetRelativePathReason } from "./write-hazards.mjs";

export function generatedFile(file) {
  return typeof file === "string" && /(?:^|\/)language\/sparkdown\.language-(?:grammar|config|snippets)\.json$/i.test(file.replaceAll("\\", "/"));
}

export const generatedReason = "This file is generated from a YAML source under definitions/yaml/. Edit the matching YAML source, then regenerate both output locations with: cd definitions && npm run language";

// Undefined shell means both supported shell readings must allow the command.
export function decide(request) {
  if (request.kind === "edit") return request.paths.some(generatedFile) ? generatedReason : controlByteReason(request.contents ?? []);
  if (request.kind === "shell") return typedIssue(request.command, request.shell) ?? sharedStash(request.command, request.shell) ?? localTest(request.command, request.shell, request.cwd) ?? (request.shell === "bash" ? null : dotNetRelativePathReason(request.command));
  return null;
}
