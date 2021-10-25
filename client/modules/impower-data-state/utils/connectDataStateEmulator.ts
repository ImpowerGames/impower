import { connectDatabaseEmulator as _connectDatabaseEmulator } from "@firebase/database";
import { InternalDataState } from "../types/aliases";

const connectDataStateEmulator = (internal: InternalDataState): void => {
  return _connectDatabaseEmulator(internal, "localhost", 9000);
};

export default connectDataStateEmulator;
