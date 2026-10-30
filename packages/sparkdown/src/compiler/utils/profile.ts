import { profilePhase } from "@impower/jsonrpc/src/browser/utils/profile";

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
