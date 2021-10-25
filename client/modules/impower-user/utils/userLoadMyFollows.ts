import { AggData } from "../../impower-data-state";
import {
  UserLoadMyFollowsAction,
  USER_LOAD_MY_FOLLOWS,
} from "../types/actions/userLoadMyFollowsAction";

const userLoadMyFollows = (my_follows: {
  [key: string]: AggData;
}): UserLoadMyFollowsAction => {
  return {
    type: USER_LOAD_MY_FOLLOWS,
    payload: {
      my_follows,
    },
  };
};

export default userLoadMyFollows;
