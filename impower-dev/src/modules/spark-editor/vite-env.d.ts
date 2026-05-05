/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_SPARKDOWN_PLAYER_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
