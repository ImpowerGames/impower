import { AggData } from "../../impower-data-state";
import {
  UserLoadConnectsAction,
  USER_LOAD_CONNECTS,
} from "../types/actions/userLoadConnectsAction";

const userLoadConnects = (connects: {
  [uid: string]: AggData;
}): UserLoadConnectsAction => {
  return {
    type: USER_LOAD_CONNECTS,
    payload: {
      connects,
    },
  };
};

export default userLoadConnects;
