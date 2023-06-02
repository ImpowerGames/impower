import { setPersistence as _setPersistence } from "firebase/auth";
import Auth from "../classes/auth";
import { Persistence } from "../types/aliases";

const setPersistence = async (persistence: Persistence): Promise<void> => {
  _setPersistence(Auth.instance.internal, persistence);
};

export default setPersistence;
