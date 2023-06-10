import { AggData } from "../../../impower-data-state";

export const USER_LOAD_MY_CONNECTS = "impower/user/USER_LOAD_MY_CONNECTS";
export interface UserLoadMyConnectsAction {
  type: typeof USER_LOAD_MY_CONNECTS;
  payload: {
    my_connects: {
      [key: string]: AggData;
    };
  };
}
