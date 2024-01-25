import { InstrumentState } from "../types/InstrumentState";

export const createInstrumentState = (
  obj?: Partial<InstrumentState>
): InstrumentState => {
  return {
    volume: 1,
    ...(obj || {}),
  };
};
