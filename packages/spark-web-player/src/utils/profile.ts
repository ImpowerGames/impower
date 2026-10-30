import { profilePhase } from "@impower/jsonrpc/src/browser/utils/profile";

export const profile = (mark: "start" | "end", method: string) => {
  profilePhase(mark, method.trim());
};
