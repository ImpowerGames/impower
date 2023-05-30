import { AggData } from "../../impower-data-state";
import {
  UserLoadMyKudosAction,
  USER_LOAD_MY_KUDOS,
} from "../types/actions/userLoadMyKudosAction";

const userLoadMyKudos = (my_kudos: {
  [key: string]: AggData;
}): UserLoadMyKudosAction => {
  return {
    type: USER_LOAD_MY_KUDOS,
    payload: {
      my_kudos,
    },
  };
};

export default userLoadMyKudos;
