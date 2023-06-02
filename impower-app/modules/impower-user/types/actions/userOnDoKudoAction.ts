import { InteractiveDocumentPath } from "../../../impower-api";
import { AggData } from "../../../impower-data-state";
import { UserDoActivityAction, USER_DO_ACTIVITY } from "./userDoActivityAction";

export const userOnDoKudo = (
  onFinished: () => void,
  aggData: AggData,
  ...path: InteractiveDocumentPath
): UserDoActivityAction => {
  return {
    type: USER_DO_ACTIVITY,
    payload: { onFinished, aggData, path, type: "kudos" },
  };
};
