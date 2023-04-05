import { connectStorageEmulator as _connectStorageEmulator } from "@firebase/storage";
import { InternalStorage } from "../types/aliases";

const connectStorageEmulator = (internal: InternalStorage): void => {
  return _connectStorageEmulator(
    internal,
    process.env.NEXT_PUBLIC_EMULATOR_HOST,
    9199
  );
};

export default connectStorageEmulator;
