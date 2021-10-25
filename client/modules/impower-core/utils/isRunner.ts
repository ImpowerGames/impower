import { Runner } from "../classes/runner";

const isRunner = (obj: unknown): obj is Runner => {
  if (!obj) {
    return false;
  }
  return true;
};

export default isRunner;
