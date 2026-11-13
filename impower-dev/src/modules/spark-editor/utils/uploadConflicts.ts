import { signal } from "@preact/signals";
import { assetClaimOf } from "./assetClaim";
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
    conflictRequest.value = { name, location, remaining, resolve };
  });
}

let uploadChain: Promise<unknown> = Promise.resolve();
function withUploadLock<T>(fn: () => Promise<T>): Promise<T> {
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

function uniqueRel(
  rel: string,
  address: string | undefined,
  taken: Set<string>,
  claimed: Set<string>,
): string {
  const dir = dirOf(rel);
  const namesInDir = [...taken]
    .filter((r) => dirOf(r) === lc(dir))
    .map((r) => baseOf(r));
  for (;;) {
    const candidate = dir + getUniqueFileName(namesInDir, baseOf(rel));
    const claim = assetClaimOf(candidate, address);
    if (claim === undefined || !claimed.has(claim)) {
      return candidate;
    }
    namesInDir.push(baseOf(candidate));
  }
}

export interface UploadItem<T> {
  rel: string;
  payload: T;
  address?: string;
}

export interface ResolvedUpload<T> {
  survivors: { uri: string; payload: T }[];
  trashedOldUris: string[];
  since: number;
}

export function resolveUploadConflicts<T, R>(
  projectId: string,
  items: UploadItem<T>[],
  write: (resolved: ResolvedUpload<T>) => Promise<R>,
): Promise<R> {
  return withUploadLock(async () =>
    write(await resolveLocked(projectId, items)),
  );
}

async function resolveLocked<T>(
  projectId: string,
  items: UploadItem<T>[],
): Promise<ResolvedUpload<T>> {
  const { Workspace } = await import("../workspace/Workspace");
  const files: Record<string, { src?: string } | undefined> =
    await Workspace.fs.getFiles(projectId);
  const actualByKey = new Map<string, string>();
  const actualByClaim = new Map<string, string>();
  for (const [u, file] of Object.entries(files)) {
    const r = Workspace.fs.getRelativePath(projectId, u);
    actualByKey.set(lc(r), r);
    const claim = assetClaimOf(r, file?.src);
    if (claim !== undefined && !actualByClaim.has(claim)) {
      actualByClaim.set(claim, r);
    }
  }
  const existingOf = (item: UploadItem<T>) => {
    const claim = assetClaimOf(item.rel, item.address);
    return (
      actualByKey.get(lc(item.rel)) ??
      (claim === undefined ? undefined : actualByClaim.get(claim))
    );
  };
  const taken = new Set(actualByKey.keys());
  const claimed = new Set(actualByClaim.keys());
  const replaced = new Set<string>();
  let remaining = items.filter((it) => existingOf(it) !== undefined).length;

  const survivors: { uri: string; payload: T }[] = [];
  const trashedRels: string[] = [];
  let applyAll: ConflictResolution | null = null;
  const land = (rel: string, item: UploadItem<T>) => {
    taken.add(lc(rel));
    const claim = assetClaimOf(rel, item.address);
    if (claim !== undefined) {
      claimed.add(claim);
    }
    survivors.push({
      uri: Workspace.fs.getFileUri(projectId, rel),
      payload: item.payload,
    });
  };

  for (const item of items) {
    const existingRel = existingOf(item);

    if (existingRel === undefined) {
      const claim = assetClaimOf(item.rel, item.address);
      const clashes =
        taken.has(lc(item.rel)) || (claim !== undefined && claimed.has(claim));
      land(
        clashes ? uniqueRel(item.rel, item.address, taken, claimed) : item.rel,
        item,
      );
      continue;
    }

    const res: ConflictResolution =
      applyAll ??
      (await requestResolution(baseOf(existingRel), dirOf(existingRel), remaining));
    remaining -= 1;
    if (res.applyToAll) {
      applyAll = res;
    }
    if (res.action === "skip") {
      continue;
    }

    if (res.action === "replace" && !replaced.has(existingRel)) {
      replaced.add(existingRel);
      trashedRels.push(existingRel);
      land(lc(existingRel) === lc(item.rel) ? existingRel : item.rel, item);
    } else {
      land(uniqueRel(item.rel, item.address, taken, claimed), item);
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
