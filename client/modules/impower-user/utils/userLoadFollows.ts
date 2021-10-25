import { AggData } from "../../impower-data-state";
import {
  UserLoadFollowsAction,
  USER_LOAD_FOLLOWS,
} from "../types/actions/userLoadFollowsAction";

const userLoadFollows = (follows: {
  [uid: string]: AggData;
}): UserLoadFollowsAction => {
  return {
    type: USER_LOAD_FOLLOWS,
    payload: {
      follows,
    },
  };
};

export default userLoadFollows;
