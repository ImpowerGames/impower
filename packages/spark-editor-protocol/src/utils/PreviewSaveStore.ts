import type { PreviewSave } from "../protocols/preview/ListSavesMessage";

export interface PreviewSaveFiles {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
}

const isSave = (value: unknown): value is PreviewSave => {
  const save = value as Partial<PreviewSave> | null;
  return (
    !!save &&
    typeof save.id === "string" &&
    (save.kind === "lastRun" || save.kind === "saved") &&
    typeof save.name === "string" &&
    typeof save.scene === "string" &&
    typeof save.data === "string" &&
    typeof save.time === "number" &&
    typeof save.line === "number"
  );
};

export class PreviewSaveStore {
  protected _queue: Promise<unknown> = Promise.resolve();

  constructor(protected _files: PreviewSaveFiles) {}

  protected fileOf(projectId: string) {
    return `${encodeURIComponent(projectId)}.json`;
  }

  protected async read(projectId: string): Promise<PreviewSave[]> {
    const text = await this._files.read(this.fileOf(projectId));
    if (text === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isSave) : [];
  }

  protected change(
    projectId: string,
    edit: (saves: PreviewSave[]) => PreviewSave[],
  ): Promise<void> {
    const next = this._queue.then(async () => {
      const saves = edit(await this.read(projectId));
      await this._files.write(this.fileOf(projectId), JSON.stringify(saves));
    });
    this._queue = next.catch(() => undefined);
    return next;
  }

  list(projectId: string): Promise<PreviewSave[]> {
    const next = this._queue.then(() => this.read(projectId));
    this._queue = next.catch(() => undefined);
    return next;
  }

  write(projectId: string, save: PreviewSave): Promise<void> {
    if (!isSave(save)) {
      return Promise.reject(new Error("The save is not one the editor keeps."));
    }
    return this.change(projectId, (saves) =>
      saves.some((kept) => kept.id === save.id)
        ? saves.map((kept) => (kept.id === save.id ? save : kept))
        : [...saves, save],
    );
  }

  rename(projectId: string, id: string, name: string): Promise<void> {
    return this.change(projectId, (saves) => {
      if (!saves.some((save) => save.id === id)) {
        throw new Error("No save has that id.");
      }
      return saves.map((save) => (save.id === id ? { ...save, name } : save));
    });
  }

  delete(projectId: string, ids: readonly string[]): Promise<void> {
    return this.change(projectId, (saves) =>
      saves.filter((save) => !ids.includes(save.id)),
    );
  }
}
