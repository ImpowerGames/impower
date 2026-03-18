import { ViewPlugin, ViewUpdate } from "@codemirror/view";
import { LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

export interface ServerAutoSyncConfig {
  /** Debounce fetch after edits (ms). Default: 500 */
  delay?: number;
}

export function serverAutoSync(
  config: ServerAutoSyncConfig = {},
): LSPClientExtension {
  const { delay = 500 } = config;

  const serverAutoSync = ViewPlugin.define(() => {
    let pending = -1;
    return {
      update(update: ViewUpdate) {
        if (update.docChanged) {
          if (delay > 0) {
            if (pending > -1) clearTimeout(pending);
            pending = setTimeout(() => {
              pending = -1;
              let plugin = LSPPlugin.get(update.view);
              if (plugin) plugin.client.sync();
            }, delay);
          } else {
            let plugin = LSPPlugin.get(update.view);
            if (plugin) plugin.client.sync();
          }
        }
      },
      destroy() {
        if (pending > -1) clearTimeout(pending);
      },
    };
  });

  return {
    editorExtension: serverAutoSync,
  };
}
