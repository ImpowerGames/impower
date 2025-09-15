/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_SPARKDOWN_EDITOR_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
