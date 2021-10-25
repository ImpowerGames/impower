import { InteractiveDocumentPath } from "../../../impower-api";
import { UserDoActivityAction, USER_DO_ACTIVITY } from "./userDoActivityAction";

export const userOnDoLike = (
  onFinished: () => void,
  ...path: InteractiveDocumentPath
): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { onFinished, path, type: "likes" },
  };
};
