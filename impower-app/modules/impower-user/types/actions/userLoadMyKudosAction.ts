import { AggData } from "../../../impower-data-state";

export const USER_LOAD_MY_KUDOS = "impower/user/USER_LOAD_MY_KUDOS";
export interface UserLoadMyKudosAction {
  type: typeof USER_LOAD_MY_KUDOS;
  payload: {
    my_kudos: {
      [key: string]: AggData;
    };
  };
}
