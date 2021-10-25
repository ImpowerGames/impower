import { AggData } from "../../../impower-data-state";

export const USER_LOAD_FOLLOWS = "@impower/user/USER_LOAD_FOLLOWS";
export interface UserLoadFollowsAction {
  type: typeof USER_LOAD_FOLLOWS;
  payload: {
    follows: {
      [uid: string]: AggData;
    };
  };
}
