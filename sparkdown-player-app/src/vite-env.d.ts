/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_SPARKDOWN_EDITOR_ORIGIN: string;
  // DEV-ONLY: when set, this app is served same-origin under the editor's
  // /__player/ base instead of as a cross-origin iframe.
  readonly VITE_SAME_ORIGIN_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
