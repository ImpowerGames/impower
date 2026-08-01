import { profilePhase } from "@impower/jsonrpc/src/browser/utils/profile";

// One implementation lives in @impower/jsonrpc; see the notes there for why
// entries are cleared and why the duration is not resolved through mark names.
// A language server is long-lived and this helper is unconditional, so before
// the entries were cleared it grew across requests without bound.
export const profile = (
  mark: "start" | "end",
  method: string,
  uri: string = "",
) => {
  profilePhase(mark, `${method} ${uri}`.trim());
};
