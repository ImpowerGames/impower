import { AggData } from "../../impower-data-state";
import {
  UserLoadMyLikesAction,
  USER_LOAD_MY_LIKES,
} from "../types/actions/userLoadMyLikesAction";

const userLoadMyLikes = (my_likes: {
  [key: string]: AggData;
}): UserLoadMyLikesAction => {
  return {
    type: USER_LOAD_MY_LIKES,
    payload: {
      my_likes,
    },
  };
};

export default userLoadMyLikes;
