import { connectDatabaseEmulator as _connectDatabaseEmulator } from "@firebase/database";
import { InternalDataState } from "../types/aliases";

const connectDataStateEmulator = (internal: InternalDataState): void => {
  return _connectDatabaseEmulator(
    internal,
    process.env.NEXT_PUBLIC_EMULATOR_HOST,
    9000
  );
};

export default connectDataStateEmulator;
