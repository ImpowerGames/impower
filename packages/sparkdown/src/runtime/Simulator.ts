import type { ProgramAddress } from "../compiler/types/ProgramAddress";

export type SimulatorSnapshot = {
  conditionPointer: Record<ProgramAddress, number>;
  choicePointer: Record<ProgramAddress, number>;
};

export type Simulator = {
  forceCondition: (site: ProgramAddress) => boolean | null;
  forceChoice: (site: ProgramAddress) => string | null;
  willForceCondition: (site: ProgramAddress) => boolean;
  willForceChoice: (site: ProgramAddress) => boolean;
  saveSnapshot: () => SimulatorSnapshot;
};
