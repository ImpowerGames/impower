import { ActivityType, InteractiveDocumentPath } from "../../../impower-api";
import { AggData } from "../../../impower-data-state";

export const USER_DO_ACTIVITY = "impower/user/DO_ACTIVITY";
export interface UserDoActivityAction {
  type: typeof USER_DO_ACTIVITY;
  payload: {
    onFinished?: () => void;
    aggData?: AggData;
    path: InteractiveDocumentPath;
    type: ActivityType;
  };
}
