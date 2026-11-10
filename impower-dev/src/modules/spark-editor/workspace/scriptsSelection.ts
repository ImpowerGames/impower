import { computed, signal } from "@preact/signals";
import { isInside, MAIN_SCRIPT } from "./scriptsListing";
import workspace from "./WorkspaceStore";

const exists = (path: string) => {
  const listing = workspace.scriptListing.value;
  return (
    !!listing &&
    (Object.hasOwn(listing.files, path) ||
      listing.folders.includes(path) ||
      Object.keys(listing.files).some((p) => isInside(p, path)))
  );
};

export class ScriptsSelection {
  protected readonly picked = signal<readonly string[] | null>(null);

  readonly active = computed(() => this.picked.value !== null);

  readonly selected = computed(() =>
    (this.picked.value ?? []).filter((p) => p !== MAIN_SCRIPT && exists(p)).sort(),
  );

  start(path?: string) {
    const kept = this.picked.peek() ?? [];
    this.picked.value =
      path && path !== MAIN_SCRIPT && !kept.includes(path) ? [...kept, path] : [...kept];
  }

  toggle(path: string) {
    if (path === MAIN_SCRIPT) {
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
      ...paths.filter((p) => p !== MAIN_SCRIPT && !kept.includes(p)),
    ];
  }

  end() {
    this.picked.value = null;
  }
}

export default new ScriptsSelection();
