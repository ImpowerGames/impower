import { InteractiveDocumentPath } from "../../../impower-api";
import { UserDoActivityAction, USER_DO_ACTIVITY } from "./userDoActivityAction";

export const userOnDoKudo = (
  onFinished: () => void,
  c: string,
  ...path: InteractiveDocumentPath
): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { onFinished, c, path, type: "kudos" },
  };
};
