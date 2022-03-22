import { UserChangeMemberAction } from "./actions/userChangeMemberAction";
import { UserCreateSubmissionAction } from "./actions/userCreateSubmissionAction";
import { UserDeleteSubmissionAction } from "./actions/userDeleteSubmissionAction";
import { UserDoActivityAction } from "./actions/userDoActivityAction";
import { UserLoadConnectsAction } from "./actions/userLoadConnectsAction";
import { UserLoadCustomizationsAction } from "./actions/userLoadCustomizationsAction";
import { UserLoadFollowsAction } from "./actions/userLoadFollowsAction";
import { UserLoadMyConnectsAction } from "./actions/userLoadMyConnectsAction";
import { UserLoadMyDislikesAction } from "./actions/userLoadMyDislikesAction";
import { UserLoadMyFollowsAction } from "./actions/userLoadMyFollowsAction";
import { UserLoadMyKudosAction } from "./actions/userLoadMyKudosAction";
import { UserLoadMyLikesAction } from "./actions/userLoadMyLikesAction";
import { UserLoadMyMembershipsAction } from "./actions/userLoadMyMembershipsAction";
import { UserLoadMyReportsAction } from "./actions/userLoadMyReportsAction";
import { UserLoadMySubmissionsAction } from "./actions/userLoadMySubmissionsAction";
import { UserLoadNotificationsAction } from "./actions/userLoadNotificationsAction";
import { UserLoadSettingsAction } from "./actions/userLoadSettingsAction";
import { UserLoadSubmissionsAction } from "./actions/userLoadSubmissionsAction";
import { UserLoadUserDocAction } from "./actions/userLoadUserDocAction";
import { UserQueueFileUploadAction } from "./actions/userQueueFileUploadAction";
import { UserRejectConnectAction } from "./actions/userRejectConnectAction";
import { UserSetCustomizationAction } from "./actions/userSetCustomizationAction";
import { UserSetSettingAction } from "./actions/userSetSettingAction";
import { UserSetTempEmailAction } from "./actions/userSetTempEmailAction";
import { UserSetTempUsernameAction } from "./actions/userSetTempUsernameAction";
import { UserStartFileUploadTaskAction } from "./actions/userStartFileUploadTaskAction";
import { UserUndoActivityAction } from "./actions/userUndoActivityAction";
import { UserUpdateFileUploadStateAction } from "./actions/userUpdateFileUploadStateAction";
import { UserUpdateSubmissionAction } from "./actions/userUpdateSubmissionAction";

export type UserAction =
  | UserLoadUserDocAction
  | UserLoadSubmissionsAction
  | UserLoadCustomizationsAction
  | UserLoadSettingsAction
  | UserLoadFollowsAction
  | UserLoadConnectsAction
  | UserLoadMySubmissionsAction
  | UserLoadMyMembershipsAction
  | UserLoadMyFollowsAction
  | UserLoadMyConnectsAction
  | UserLoadMyLikesAction
  | UserLoadMyDislikesAction
  | UserLoadMyKudosAction
  | UserLoadMyReportsAction
  | UserLoadNotificationsAction
  | UserDoActivityAction
  | UserUndoActivityAction
  | UserRejectConnectAction
  | UserChangeMemberAction
  | UserCreateSubmissionAction
  | UserUpdateSubmissionAction
  | UserDeleteSubmissionAction
  | UserSetCustomizationAction
  | UserSetSettingAction
  | UserSetTempEmailAction
  | UserSetTempUsernameAction
  | UserQueueFileUploadAction
  | UserStartFileUploadTaskAction
  | UserUpdateFileUploadStateAction;
