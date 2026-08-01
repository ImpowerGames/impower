import { profilePhase } from "@impower/jsonrpc/src/browser/utils/profile";

// One implementation lives in @impower/jsonrpc; see the notes there for why
// entries are cleared and why the duration is not resolved through mark names.
export {
  profilePhase,
  setRetainProfilerEntries,
} from "@impower/jsonrpc/src/browser/utils/profile";

export const profile = (
  mark: "start" | "end",
  profilerId: string | undefined,
  method: string,
  uri: string = "",
) => {
  if (!profilerId) {
    return;
  }
  profilePhase(mark, `${profilerId} ${method} ${uri}`.trim());
};
