/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

/**
 * Browser-visible build-time values. `vite.config.ts` replaces every
 * `import.meta.env.<KEY>` whose key starts with `VITE_` or `BROWSER_` with a
 * string literal, so a key that is absent from the build environment is simply
 * never substituted — every entry here is optional apart from the player origin
 * the editor cannot run without.
 */
interface ImportMetaEnv {
  readonly VITE_SPARKDOWN_PLAYER_ORIGIN: string;
  /** Dev only: embed the game preview same-origin under `/__player/`. */
  readonly VITE_SAME_ORIGIN_PREVIEW?: string;
  /** Google Drive sync: browser API key. */
  readonly BROWSER_GOOGLE_API_KEY?: string;
  /** Google Drive sync: OAuth client id, which also carries the app id. */
  readonly BROWSER_GOOGLE_OAUTH_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
