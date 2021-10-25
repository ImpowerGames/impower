import { connectStorageEmulator as _connectStorageEmulator } from "@firebase/storage";
import { InternalStorage } from "../types/aliases";

const connectStorageEmulator = (internal: InternalStorage): void => {
  return _connectStorageEmulator(internal, "localhost", 9199);
};

export default connectStorageEmulator;
