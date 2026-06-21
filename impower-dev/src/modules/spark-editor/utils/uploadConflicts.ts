import { signal } from "@preact/signals";
import getUniqueFileName from "./getUniqueFileName";

export type ConflictAction = "replace" | "keepboth" | "skip";

export interface ConflictResolution {
  action: ConflictAction;
  /** Apply this choice to every remaining conflict in this upload. */
  applyToAll: boolean;
}

export interface ConflictRequest {
  /** The incoming file's name (display). */
  name: string;
  /** The folder it's importing into (display, "" = project root). */
  location: string;
  /** How many conflicts remain in this upload (incl. this one) — for the UI. */
  remaining: number;
  resolve: (r: ConflictResolution) => void;
}

/** The conflict prompt currently awaiting a choice, or null. Read by ConflictDialogHost. */
export const conflictRequest = signal<ConflictRequest | null>(null);

function requestResolution(
  name: string,
  location: string,
  remaining: number,
): Promise<ConflictResolution> {
  return new Promise((resolve) => {
    conflictRequest.value = { name, location, remaining, resolve };
  });
}

const lc = (s: string) => s.toLowerCase();
const dirOf = (rel: string) =>
  rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : "";
const baseOf = (rel: string) =>
  rel.includes("/") ? rel.slice(rel.lastIndexOf("/") + 1) : rel;

// A relative path not already taken (case-insensitively) — `photo.png` ->
// `photo01.png` in the SAME folder, matching getUniqueFileName's scheme.
function uniqueRel(rel: string, taken: Set<string>): string {
  const dir = dirOf(rel);
  const namesInDir = [...taken]
    .filter((r) => dirOf(r) === lc(dir))
    .map((r) => baseOf(r));
  const unique = getUniqueFileName(namesInDir, baseOf(rel));
  return dir + unique;
}

export interface ResolvedUpload<T> {
  /** The files to actually write, with their (possibly renamed) target uri. */
  survivors: { uri: string; payload: T }[];
  /** Existing files that "Replace" moved to trash (one batch). */
  trashedOldUris: string[];
  /** Timestamp captured just before the trash move (for undo batch lookup). */
  since: number;
}

/**
 * Resolve same-path conflicts for an upload BEFORE writing. For each incoming
 * item whose target already exists in the project, prompts Replace / Keep both
 * / Skip (with apply-to-all, remembered for the rest of this upload). "Replace"
 * moves the existing file to TRASH (recoverable) so the subsequent write is
 * clean and undoable; "Keep both" picks a unique name; "Skip" drops it. Two
 * incoming files that collide with each other (no existing file to replace)
 * auto-Keep-both. Generic over the write payload (a File or an ArrayBuffer).
 */
export async function resolveUploadConflicts<T>(
  projectId: string,
  items: { rel: string; payload: T }[],
): Promise<ResolvedUpload<T>> {
  const { Workspace } = await import("../workspace/Workspace");
  const files = await Workspace.fs.getFiles(projectId);
  const existing = new Set(
    Object.keys(files).map((u) => lc(Workspace.fs.getRelativePath(projectId, u))),
  );
  // Grows as Keep-both / new names are assigned, so later items in the same
  // batch see earlier picks.
  const taken = new Set(existing);
  const conflicting = items.filter((it) => existing.has(lc(it.rel)));
  let remaining = conflicting.length;

  const survivors: { uri: string; payload: T }[] = [];
  const trashedRels: string[] = [];
  let applyAll: ConflictResolution | null = null;

  for (const item of items) {
    let rel = item.rel;
    const key = lc(rel);
    const existsInProject = existing.has(key);

    if (!existsInProject) {
      // Only an in-batch collision is possible — auto Keep-both (nothing to
      // replace).
      if (taken.has(key)) {
        rel = uniqueRel(rel, taken);
      }
      taken.add(lc(rel));
      survivors.push({ uri: Workspace.fs.getFileUri(projectId, rel), payload: item.payload });
      continue;
    }

    const res = applyAll ?? (await requestResolution(baseOf(rel), dirOf(rel), remaining));
    remaining -= 1;
    if (res.applyToAll) {
      applyAll = res;
    }
    if (res.action === "skip") {
      continue;
    }
    if (res.action === "keepboth") {
      rel = uniqueRel(rel, taken);
      taken.add(lc(rel));
      survivors.push({ uri: Workspace.fs.getFileUri(projectId, rel), payload: item.payload });
    } else {
      // Replace: the existing file at this rel will be trashed; write over the
      // freed path.
      trashedRels.push(rel);
      survivors.push({ uri: Workspace.fs.getFileUri(projectId, rel), payload: item.payload });
    }
  }

  let since = 0;
  const trashedOldUris = trashedRels.map((r) => Workspace.fs.getFileUri(projectId, r));
  if (trashedOldUris.length > 0) {
    since = Date.now();
    await Workspace.fs.deleteFiles({
      files: trashedOldUris.map((uri) => ({ uri })),
      mode: "trash",
    });
  }
  return { survivors, trashedOldUris, since };
}
