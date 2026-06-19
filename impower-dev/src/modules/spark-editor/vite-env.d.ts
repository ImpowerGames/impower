/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_SPARKDOWN_PLAYER_ORIGIN: string;
  // DEV-ONLY: when set, embed the game preview same-origin under /__player/.
  readonly VITE_SAME_ORIGIN_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
