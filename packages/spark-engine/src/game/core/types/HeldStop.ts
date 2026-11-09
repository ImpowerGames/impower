import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { RunBeat } from "../classes/RunRecord";
import type { ScriptLocation } from "./ScriptLocation";

export interface HeldStop {
  readonly reason: "step" | "breakpoint";
  readonly beat: RunBeat | undefined;
  readonly address: ProgramAddress | undefined;
  readonly location: ScriptLocation | null;
  readonly queued: boolean;
}
