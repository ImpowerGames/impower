export type SimulatorSnapshot = {
  conditionPointer: Record<string, number>;
  choicePointer: Record<string, number>;
};

export type Simulator = {
  forceCondition: (sitePath: string) => boolean | null;
  forceChoice: (sitePath: string) => string | null;
  willForceCondition: (sitePath: string) => boolean;
  willForceChoice: (sitePath: string) => boolean;
  saveSnapshot: () => SimulatorSnapshot;
  restoreSnapshot: (snap: SimulatorSnapshot) => void;
};
