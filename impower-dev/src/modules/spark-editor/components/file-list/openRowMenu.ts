import { signal } from "@preact/signals";

/**
 * Identity of the single row menu currently open — the per-row 3-dots dropdown
 * (FileOptionsButton) OR the desktop right-click context menu (FileItem). Only
 * one may be open at a time across every row: opening any menu assigns its key
 * here, and each open menu watches this signal and closes itself the moment the
 * key no longer matches.
 *
 * This coordinates the two DIFFERENT menu systems, which Radix can't reconcile on
 * its own — the 3-dots trigger stops click propagation (so a row click doesn't
 * open the file), which also prevents Radix's outside-click from dismissing a
 * sibling row's / the right-click context menu.
 */
export const openRowMenu = signal<symbol | null>(null);
