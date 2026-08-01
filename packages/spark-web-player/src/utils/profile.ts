import { profilePhase } from "@impower/jsonrpc/src/browser/utils/profile";

// One implementation lives in @impower/jsonrpc; see the notes there for why
// entries are cleared and why the duration is not resolved through mark names.
// This helper is unconditional — it brackets every protocol message the player
// handles — so before the entries were cleared it grew for the life of the page.
export const profile = (mark: "start" | "end", method: string) => {
  profilePhase(mark, method.trim());
};
