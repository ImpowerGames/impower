import type { PreviewSaveFiles } from "@impower/spark-editor-protocol/src/utils/PreviewSaveStore";

export const PREVIEW_SAVES_DIRECTORY = "preview-saves";

export const opfsSaveFiles = (): PreviewSaveFiles => {
  const directory = async () =>
    (await navigator.storage.getDirectory()).getDirectoryHandle(
      PREVIEW_SAVES_DIRECTORY,
      { create: true },
    );
  return {
    async read(name) {
      try {
        const handle = await (await directory()).getFileHandle(name);
        return await (await handle.getFile()).text();
      } catch (e) {
        if (e instanceof DOMException && e.name === "NotFoundError") {
          return null;
        }
        throw e;
      }
    },
    async write(name, text) {
      const handle = await (
        await directory()
      ).getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    },
  };
};
