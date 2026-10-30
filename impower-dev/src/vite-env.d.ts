/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_SPARKDOWN_PLAYER_ORIGIN: string;
  readonly VITE_SAME_ORIGIN_PREVIEW?: string;
  readonly BROWSER_GOOGLE_API_KEY?: string;
  readonly BROWSER_GOOGLE_OAUTH_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
