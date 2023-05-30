import { AggData } from "../../../impower-data-state";

export const USER_LOAD_MY_LIKES = "@impower/user/USER_LOAD_MY_LIKES";
export interface UserLoadMyLikesAction {
  type: typeof USER_LOAD_MY_LIKES;
  payload: {
    my_likes: {
      [key: string]: AggData;
    };
  };
}
