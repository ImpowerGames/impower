import { AggData } from "../../../impower-data-state";

export const USER_LOAD_MY_DISLIKES = "@impower/user/USER_LOAD_MY_DISLIKES";
export interface UserLoadMyDislikesAction {
  type: typeof USER_LOAD_MY_DISLIKES;
  payload: {
    my_dislikes: {
      [key: string]: AggData;
    };
  };
}
