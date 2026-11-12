import type {
  ImportFailureReason,
  ImportOutcome,
} from "@impower/spark-editor-protocol/src/types";
import { MAIN_SCRIPT } from "./scriptsListing";

export type ProjectZipRoot =
  | { kind: "root"; root: string; leftOut: { count: number; folders: string[] } }
  | { kind: "refused"; reason: "no_main_script" }
  | { kind: "refused"; reason: "several_main_scripts"; folders: string[] };

const DROPPED_FOLDERS = new Set(["__MACOSX"]);
const DROPPED_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

export const isArchiveDropping = (path: string) => {
  const segments = path.split("/").filter(Boolean);
  return (
    segments.some((segment) => DROPPED_FOLDERS.has(segment)) ||
    DROPPED_FILES.has(segments[segments.length - 1] ?? "")
  );
};

export const findProjectRoot = (paths: readonly string[]): ProjectZipRoot => {
  const files = paths.filter(
    (path) => path && !path.endsWith("/") && !isArchiveDropping(path),
  );
  const mains = files
    .filter((path) => path.split("/").pop() === MAIN_SCRIPT)
    .map((path) => path.slice(0, path.length - MAIN_SCRIPT.length));
  if (mains.length === 0) {
    return { kind: "refused", reason: "no_main_script" };
  }
  const depth = (root: string) => root.split("/").length;
  const shallowest = Math.min(...mains.map(depth));
  const candidates = mains.filter((root) => depth(root) === shallowest);
  if (candidates.length > 1) {
    return {
      kind: "refused",
      reason: "several_main_scripts",
      folders: candidates.map((root) => root.replace(/\/$/, "")).sort(),
    };
  }
  const root = candidates[0]!;
  const outside = files.filter((path) => !path.startsWith(root));
  const folders = [
    ...new Set(
      outside.map((path) =>
        path.includes("/") ? path.slice(0, path.indexOf("/")) : "",
      ),
    ),
  ].sort();
  return { kind: "root", root, leftOut: { count: outside.length, folders } };
};

const IMPORT_OUTCOME_STORAGE_KEY = "workspace/importOutcome";

export const keepImportOutcome = (outcome: ImportOutcome) => {
  if (outcome.status === "imported" && outcome.leftOut?.count) {
    sessionStorage.setItem(IMPORT_OUTCOME_STORAGE_KEY, JSON.stringify(outcome));
  }
};

export const takeImportOutcome = (): ImportOutcome | undefined => {
  if (typeof sessionStorage === "undefined") {
    return undefined;
  }
  const kept = sessionStorage.getItem(IMPORT_OUTCOME_STORAGE_KEY);
  sessionStorage.removeItem(IMPORT_OUTCOME_STORAGE_KEY);
  return kept ? (JSON.parse(kept) as ImportOutcome) : undefined;
};

export const REFUSED_BEFORE_CHANGE: ReadonlySet<ImportFailureReason> = new Set([
  "unreadable_zip",
  "no_main_script",
  "several_main_scripts",
]);

export class ProjectImportError extends Error {
  readonly reason: ImportFailureReason;
  readonly folders?: string[];

  constructor(
    failure: { reason: ImportFailureReason; folders?: string[] },
    options?: { cause?: unknown },
  ) {
    super(failure.reason, options);
    this.reason = failure.reason;
    this.folders = failure.folders;
  }
}

const quoted = (folders: readonly string[]) =>
  folders.map((folder) => (folder ? `“${folder}”` : "the zip’s top level"));

const listed = (items: readonly string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const FAILURE_SENTENCES: Record<
  ImportFailureReason,
  (fileName: string, folders: readonly string[]) => string
> = {
  unreadable_zip: (fileName) =>
    `Nothing was changed because “${fileName}” is not a .zip the editor can open.`,
  no_main_script: (fileName) =>
    `Nothing was changed because “${fileName}” has no ${MAIN_SCRIPT}, which every project backup needs.`,
  several_main_scripts: (fileName, folders) =>
    `Nothing was changed because “${fileName}” holds more than one project, in ${listed(quoted(folders))}, so zip one of them on its own.`,
  storage: (fileName) =>
    `Could not save “${fileName}” on this device, so free some space and try again.`,
  unknown: (fileName) =>
    `Could not import “${fileName}”, so try again or choose another backup.`,
};

export const importOutcomeSentence = (outcome: ImportOutcome): string | null => {
  if (outcome.status === "failed") {
    return FAILURE_SENTENCES[outcome.reason](
      outcome.fileName,
      outcome.folders ?? [],
    );
  }
  const leftOut = outcome.leftOut;
  if (!leftOut || leftOut.count === 0) {
    return null;
  }
  const files = leftOut.count === 1 ? "1 file" : `${leftOut.count} files`;
  return `Imported “${outcome.fileName}” and left out ${files} outside the project folder, in ${listed(quoted(leftOut.folders))}.`;
};
