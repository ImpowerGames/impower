import { connectFirestoreEmulator as _connectFirestoreEmulator } from "firebase/firestore/lite";
import { InternalDataStore } from "../types/aliases";

const connectDataStoreEmulator = (internal: InternalDataStore): void => {
  return _connectFirestoreEmulator(internal, "localhost", 8080);
};

export default connectDataStoreEmulator;
