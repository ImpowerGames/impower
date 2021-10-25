import { StudioDocument } from "../../impower-data-store";
import {
  UserLoadStudiosAction,
  USER_LOAD_STUDIOS,
} from "../types/actions/userLoadStudiosAction";

const userLoadStudios = (studios: {
  [id: string]: StudioDocument;
}): UserLoadStudiosAction => {
  return {
    type: USER_LOAD_STUDIOS,
    payload: { studios },
  };
};

export default userLoadStudios;
