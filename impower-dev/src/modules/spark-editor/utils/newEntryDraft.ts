import { signal } from "@preact/signals";

export interface NewEntryDraftRequest {
  dir: string;
  ext: string;
  token: number;
}

export const newEntryDraftRequest = signal<NewEntryDraftRequest | null>(null);

let counter = 0;

export function requestNewEntry(dir: string, ext: string) {
  counter += 1;
  newEntryDraftRequest.value = { dir, ext, token: counter };
}
