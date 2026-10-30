import { signal } from "@preact/signals";
import getUniqueFileName from "./getUniqueFileName";

export type ConflictAction = "replace" | "keepboth" | "skip";

export interface ConflictResolution {
  action: ConflictAction;
  applyToAll: boolean;
}

export interface ConflictRequest {
  name: string;
  location: string;
  remaining: number;
  resolve: (r: ConflictResolution) => void;
}

export const conflictRequest = signal<ConflictRequest | null>(null);

function requestResolution(
  name: string,
  location: string,
  remaining: number,
): Promise<ConflictResolution> {
  return new Promise((resolve) => {
    const prev = conflictRequest.peek();
    if (prev) {
      prev.resolve({ action: "skip", applyToAll: false });
    }
    conflictRequest.value = { name, location, remaining, resolve };
  });
}

let uploadChain: Promise<unknown> = Promise.resolve();
export function withUploadLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = uploadChain.then(fn, fn);
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

function uniqueRel(rel: string, taken: Set<string>): string {
  const dir = dirOf(rel);
  const namesInDir = [...taken]
    .filter((r) => dirOf(r) === lc(dir))
    .map((r) => baseOf(r));
  const unique = getUniqueFileName(namesInDir, baseOf(rel));
  return dir + unique;
}

export interface ResolvedUpload<T> {
  survivors: { uri: string; payload: T }[];
  trashedOldUris: string[];
  since: number;
}

export async function resolveUploadConflicts<T>(
  projectId: string,
  items: { rel: string; payload: T }[],
): Promise<ResolvedUpload<T>> {
  const { Workspace } = await import("../workspace/Workspace");
  const files = await Workspace.fs.getFiles(projectId);
  const actualByKey = new Map<string, string>();
  for (const u of Object.keys(files)) {
    const r = Workspace.fs.getRelativePath(projectId, u);
    actualByKey.set(lc(r), r);
  }
  const existing = new Set(actualByKey.keys());
  const taken = new Set(existing);
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

    const res: ConflictResolution =
      applyAll ?? (await requestResolution(baseOf(rel), dirOf(rel), remaining));
    remaining -= 1;
    if (res.applyToAll) {
      applyAll = res;
    }
    if (res.action === "skip") {
      continue;
    }

    const canonicalRel = actualByKey.get(key) ?? rel;

    if (res.action === "replace" && !replacedKeys.has(key)) {
      replacedKeys.add(key);
      taken.add(key);
      trashedRels.push(canonicalRel);
      survivors.push({
        uri: Workspace.fs.getFileUri(projectId, canonicalRel),
        payload: item.payload,
      });
    } else {
      rel = uniqueRel(rel, taken);
      taken.add(lc(rel));
      survivors.push({
        uri: Workspace.fs.getFileUri(projectId, rel),
        payload: item.payload,
      });
    }
  }

  let since = 0;
  const trashedOldUris = [
    ...new Set(trashedRels.map((r) => Workspace.fs.getFileUri(projectId, r))),
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
