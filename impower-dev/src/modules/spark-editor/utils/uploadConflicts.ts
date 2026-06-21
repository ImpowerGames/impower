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
    // Defensive: there should never already be a live request here (uploads are
    // serialized — see `withUploadLock` below), but if one somehow lingers,
    // settle it as a Skip so its awaiting upload can't hang forever.
    const prev = conflictRequest.peek();
    if (prev) {
      prev.resolve({ action: "skip", applyToAll: false });
    }
    conflictRequest.value = { name, location, remaining, resolve };
  });
}

// Serialize whole uploads. A single global `conflictRequest` slot can hold only
// one prompt; without this, a second upload starting while the first is still
// awaiting the user would overwrite the slot and strand the first promise
// forever (and a concurrent replace-of-the-same-file could double-trash). The
// chain also makes each upload's existence snapshot (getFiles) + its trash-move
// atomic w.r.t. other uploads.
let uploadChain: Promise<unknown> = Promise.resolve();
function withUploadLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = uploadChain.then(fn, fn);
  // A rejection in one upload must not poison the chain for the next.
  uploadChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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
 *
 * Whole uploads are serialized (one prompt at a time; snapshot + trash atomic).
 */
export function resolveUploadConflicts<T>(
  projectId: string,
  items: { rel: string; payload: T }[],
): Promise<ResolvedUpload<T>> {
  return withUploadLock(() => resolveUploadConflictsInner(projectId, items));
}

async function resolveUploadConflictsInner<T>(
  projectId: string,
  items: { rel: string; payload: T }[],
): Promise<ResolvedUpload<T>> {
  const { Workspace } = await import("../workspace/Workspace");
  const files = await Workspace.fs.getFiles(projectId);
  // Map a case-folded relative path -> the file's ACTUAL stored path. Conflict
  // detection is case-insensitive, but Replace must trash + overwrite the file's
  // real on-disk path (OPFS names are case-sensitive), so `Photo.PNG` dropped
  // over a stored `photo.png` resolves to `photo.png`, not a non-existent path.
  const actualByKey = new Map<string, string>();
  for (const u of Object.keys(files)) {
    const r = Workspace.fs.getRelativePath(projectId, u);
    actualByKey.set(lc(r), r);
  }
  const existing = new Set(actualByKey.keys());
  // Grows as Keep-both / new names / replaced targets are claimed, so later
  // items in the same batch don't reuse a path an earlier item already took.
  const taken = new Set(existing);
  // Existing paths already scheduled for Replace (one trash each, never twice).
  const replacedKeys = new Set<string>();
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
      survivors.push({
        uri: Workspace.fs.getFileUri(projectId, rel),
        payload: item.payload,
      });
      continue;
    }

    const res =
      applyAll ?? (await requestResolution(baseOf(rel), dirOf(rel), remaining));
    remaining -= 1;
    if (res.applyToAll) {
      applyAll = res;
    }
    if (res.action === "skip") {
      continue;
    }

    // The existing file's REAL stored path (correct case) — what Replace trashes
    // and overwrites.
    const canonicalRel = actualByKey.get(key) ?? rel;

    if (res.action === "replace" && !replacedKeys.has(key)) {
      // First Replace of this existing file: trash it once, write over its path.
      replacedKeys.add(key);
      taken.add(key);
      trashedRels.push(canonicalRel);
      survivors.push({
        uri: Workspace.fs.getFileUri(projectId, canonicalRel),
        payload: item.payload,
      });
    } else {
      // Keep both, OR a 2nd in-batch item targeting an already-replaced existing
      // file (can't replace the same file twice) — give it a fresh unique name
      // so neither uploaded file is lost.
      rel = uniqueRel(rel, taken);
      taken.add(lc(rel));
      survivors.push({
        uri: Workspace.fs.getFileUri(projectId, rel),
        payload: item.payload,
      });
    }
  }

  let since = 0;
  // `replacedKeys` already guarantees uniqueness; dedupe the uris too as a final
  // guard so the worker can never read a now-deleted source twice.
  const trashedOldUris = [
    ...new Set(
      trashedRels.map((r) => Workspace.fs.getFileUri(projectId, r)),
    ),
  ];
  if (trashedOldUris.length > 0) {
    since = Date.now();
    await Workspace.fs.deleteFiles({
      files: trashedOldUris.map((uri) => ({ uri })),
      mode: "trash",
    });
  }
  return { survivors, trashedOldUris, since };
}
