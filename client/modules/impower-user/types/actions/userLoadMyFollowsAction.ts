import { AggData } from "../../../impower-data-state";

export const USER_LOAD_MY_FOLLOWS = "@impower/user/USER_LOAD_MY_FOLLOWS";
export interface UserLoadMyFollowsAction {
  type: typeof USER_LOAD_MY_FOLLOWS;
  payload: {
    my_follows: {
      [key: string]: AggData;
    };
  };
}
