import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { isInside } from "./scriptsListing";

export const holds = (
  listing: { files: Readonly<Record<string, unknown>>; folders: readonly string[] } | null | undefined,
  path: string,
) =>
  !!listing &&
  (Object.hasOwn(listing.files, path) ||
    listing.folders.includes(path) ||
    Object.keys(listing.files).some((p) => isInside(p, path)));

export type LibrarySelectionOptions = {
  exists: (path: string) => boolean;
  fixed?: (path: string) => boolean;
};

export class LibrarySelection {
  protected readonly picked = signal<readonly string[] | null>(null);

  protected readonly fixed: (path: string) => boolean;

  readonly active = computed(() => this.picked.value !== null);

  readonly selected: ReadonlySignal<string[]>;

  constructor({ exists, fixed = () => false }: LibrarySelectionOptions) {
    this.fixed = fixed;
    this.selected = computed(() =>
      (this.picked.value ?? []).filter((p) => !fixed(p) && exists(p)).sort(),
    );
  }

  start(path?: string) {
    const kept = this.picked.peek() ?? [];
    this.picked.value =
      path && !this.fixed(path) && !kept.includes(path) ? [...kept, path] : [...kept];
  }

  toggle(path: string) {
    if (this.fixed(path)) {
      return;
    }
    const kept = this.picked.peek() ?? [];
    this.picked.value = kept.includes(path)
      ? kept.filter((p) => p !== path)
      : [...kept, path];
  }

  selectAll(paths: readonly string[]) {
    const kept = this.picked.peek() ?? [];
    this.picked.value = [
      ...kept,
      ...paths.filter((p) => !this.fixed(p) && !kept.includes(p)),
    ];
  }

  replace(from: string, to: string) {
    const kept = this.picked.peek();
    if (kept?.includes(from)) {
      this.picked.value = kept.map((p) => (p === from ? to : p));
    }
  }

  end() {
    this.picked.value = null;
  }
}
