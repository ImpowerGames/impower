import { AggData } from "../../impower-data-state";
import {
  UserLoadMyConnectsAction,
  USER_LOAD_MY_CONNECTS,
} from "../types/actions/userLoadMyConnectsAction";

const userLoadMyConnects = (my_connects: {
  [key: string]: AggData;
}): UserLoadMyConnectsAction => {
  return {
    type: USER_LOAD_MY_CONNECTS,
    payload: {
      my_connects,
    },
  };
};

export default userLoadMyConnects;
