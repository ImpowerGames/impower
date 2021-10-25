import { StudioDocument } from "../../../impower-data-store";

export const USER_LOAD_STUDIOS = "@impower/user/USER_LOAD_STUDIOS";
export interface UserLoadStudiosAction {
  type: typeof USER_LOAD_STUDIOS;
  payload: {
    studios: {
      [id: string]: StudioDocument;
    };
  };
}
