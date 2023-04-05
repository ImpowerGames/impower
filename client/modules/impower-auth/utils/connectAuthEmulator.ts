import { connectAuthEmulator as _connectAuthEmulator } from "@firebase/auth";
import { InternalAuth } from "../types/aliases";

const connectAuthEmulator = (internal: InternalAuth): void => {
  return _connectAuthEmulator(
    internal,
    `http://${process.env.NEXT_PUBLIC_EMULATOR_HOST}:9099`
  );
};

export default connectAuthEmulator;
