import { AggData } from "../../../impower-data-state";

export const USER_LOAD_CONNECTS = "@impower/user/USER_LOAD_CONNECTS";
export interface UserLoadConnectsAction {
  type: typeof USER_LOAD_CONNECTS;
  payload: {
    connects: {
      [uid: string]: AggData;
    };
  };
}
