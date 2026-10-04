export interface ScopeOverlayFile {
  path: string;
  sha256: string;
  edits: { before: string; after: string; count?: number }[];
}
export interface ScopeOverlayReceipt {
  path: string;
  inputSha256: string;
  canonicalInputSha256: string;
  outputSha256: string;
}
export const SCOPE_OVERLAY_PIN: string;
export const scopeOverlay: ScopeOverlayFile[];
export function applyScopeOverlayFile(spec: ScopeOverlayFile, input: Uint8Array): ScopeOverlayReceipt & { text: string };
export function scopeOverlayDestination(sourceRoot: string, outputRoot: string): string;
export function materializeScopeOverlay(sourceRoot: string, outputRoot: string): {
  pin: string; definitionSha256: string; files: ScopeOverlayReceipt[];
};
export function materializeScopeOverlayFiles(sourceRoot: string, outputRoot: string, files: ScopeOverlayFile[]): {
  pin: string; definitionSha256: string; files: ScopeOverlayReceipt[];
};
