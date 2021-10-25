import { AggData } from "../../impower-data-state";
import {
  UserLoadMyDislikesAction,
  USER_LOAD_MY_DISLIKES,
} from "../types/actions/userLoadMyDislikesAction";

const userLoadMyDislikes = (my_dislikes: {
  [key: string]: AggData;
}): UserLoadMyDislikesAction => {
  return {
    type: USER_LOAD_MY_DISLIKES,
    payload: {
      my_dislikes,
    },
  };
};

export default userLoadMyDislikes;
