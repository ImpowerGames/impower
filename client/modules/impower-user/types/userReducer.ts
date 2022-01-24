import { SubmissionDocumentPath, SubmissionType } from "../../impower-api";
import { DataDocument } from "../../impower-core";
import { AggData, MemberAccess, MemberData } from "../../impower-data-state";
import {
  CustomizationDocument,
  getLocalCreateAnnotatedDocument,
  getLocalUpdateAnnotatedDocument,
  isCommentDocument,
  isContributionDocument,
  isPageDocument,
  isProjectDocument,
  isStudioDocument,
  isUserDocument,
  ProjectDocument,
  SettingsDocument,
} from "../../impower-data-store";
import { USER_ACCEPT_CONNECT } from "./actions/userAcceptConnectAction";
import { USER_CHANGE_MEMBER } from "./actions/userChangeMemberAction";
import { USER_CREATE_SUBMISSION } from "./actions/userCreateSubmissionAction";
import { USER_DELETE_SUBMISSION } from "./actions/userDeleteSubmissionAction";
import { USER_DO_ACTIVITY } from "./actions/userDoActivityAction";
import { USER_LOAD_CONNECTS } from "./actions/userLoadConnectsAction";
import { USER_LOAD_CUSTOMIZATIONS } from "./actions/userLoadCustomizationsAction";
import { USER_LOAD_FOLLOWS } from "./actions/userLoadFollowsAction";
import { USER_LOAD_MY_CONNECTS } from "./actions/userLoadMyConnectsAction";
import { USER_LOAD_MY_DISLIKES } from "./actions/userLoadMyDislikesAction";
import { USER_LOAD_MY_FOLLOWS } from "./actions/userLoadMyFollowsAction";
import { USER_LOAD_MY_KUDOS } from "./actions/userLoadMyKudosAction";
import { USER_LOAD_MY_LIKES } from "./actions/userLoadMyLikesAction";
import { USER_LOAD_MY_MEMBERSHIPS } from "./actions/userLoadMyMembershipsAction";
import { USER_LOAD_MY_REPORTS } from "./actions/userLoadMyReportsAction";
import { USER_LOAD_MY_SUBMISSIONS } from "./actions/userLoadMySubmissionsAction";
import { USER_LOAD_NOTIFICATIONS } from "./actions/userLoadNotificationsAction";
import { USER_LOAD_SETTINGS } from "./actions/userLoadSettingsAction";
import { USER_LOAD_STUDIOS } from "./actions/userLoadStudiosAction";
import { USER_LOAD_SUBMISSIONS } from "./actions/userLoadSubmissionsAction";
import { USER_LOAD_USER_DOC } from "./actions/userLoadUserDocAction";
import { USER_REJECT_CONNECT } from "./actions/userRejectConnectAction";
import { USER_SET_CUSTOMIZATION } from "./actions/userSetCustomizationAction";
import { USER_SET_SETTING } from "./actions/userSetSettingAction";
import { USER_SET_TEMP_EMAIL } from "./actions/userSetTempEmailAction";
import { USER_SET_TEMP_USERNAME } from "./actions/userSetTempUsernameAction";
import { USER_UNDO_ACTIVITY } from "./actions/userUndoActivityAction";
import { USER_UPDATE_SUBMISSION } from "./actions/userUpdateSubmissionAction";
import { UserAction } from "./userActions";
import { UserState } from "./userState";

export const getSubmissionType = (
  path: SubmissionDocumentPath
): SubmissionType => {
  const colSegs = path.slice(0, -1);
  const type = colSegs[colSegs.length - 1] as SubmissionType;
  return type;
};

export const userReducer = (
  state: UserState,
  action: UserAction,
  errorHandler?: (error: string) => void
): UserState => {
  switch (action.type) {
    case USER_SET_TEMP_EMAIL: {
      const { tempEmail } = action.payload;
      const setData = async (): Promise<void> => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        Auth.instance.tempEmail = tempEmail;
      };
      setData();
      return {
        ...state,
        tempEmail,
      };
    }
    case USER_SET_TEMP_USERNAME: {
      const { tempUsername } = action.payload;
      const setData = async (): Promise<void> => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        Auth.instance.tempUsername = tempUsername;
      };
      setData();
      return {
        ...state,
        tempUsername,
      };
    }
    case USER_LOAD_STUDIOS: {
      const { studios } = action.payload;
      return {
        ...state,
        studios,
      };
    }
    case USER_LOAD_USER_DOC: {
      const { userDoc } = action.payload;
      return {
        ...state,
        userDoc,
      };
    }
    case USER_LOAD_SUBMISSIONS: {
      const { submissions } = action.payload;
      return {
        ...state,
        submissions,
      };
    }
    case USER_LOAD_CUSTOMIZATIONS: {
      const { customizations } = action.payload;
      return {
        ...state,
        customizations,
      };
    }
    case USER_LOAD_SETTINGS: {
      const { settings } = action.payload;
      return {
        ...state,
        settings,
      };
    }
    case USER_LOAD_FOLLOWS: {
      const { follows } = action.payload;
      return {
        ...state,
        follows,
      };
    }
    case USER_LOAD_CONNECTS: {
      const { connects } = action.payload;
      return {
        ...state,
        connects,
      };
    }
    case USER_LOAD_NOTIFICATIONS: {
      const { notifications } = action.payload;
      return {
        ...state,
        notifications,
      };
    }
    case USER_LOAD_MY_MEMBERSHIPS: {
      const { my_memberships } = action.payload;
      if (my_memberships === null) {
        return {
          ...state,
          my_studio_memberships: null,
          my_project_memberships: null,
        };
      }
      const my_studio_memberships: {
        [id: string]: MemberData;
      } = {};
      const my_project_memberships: {
        [id: string]: MemberData;
      } = {};
      Object.entries(my_memberships).forEach(([target, data]) => {
        const docId = target.split("%").slice(-1).join("");
        if (data.g === "studios") {
          my_studio_memberships[docId] = data;
        }
        if (data.g === "projects") {
          my_project_memberships[docId] = data;
        }
      });
      return {
        ...state,
        my_studio_memberships,
        my_project_memberships,
      };
    }
    case USER_LOAD_MY_FOLLOWS: {
      const { my_follows } = action.payload;
      return {
        ...state,
        my_follows,
      };
    }
    case USER_LOAD_MY_CONNECTS: {
      const { my_connects } = action.payload;
      return {
        ...state,
        my_connects,
      };
    }
    case USER_LOAD_MY_LIKES: {
      const { my_likes } = action.payload;
      return {
        ...state,
        my_likes,
      };
    }
    case USER_LOAD_MY_DISLIKES: {
      const { my_dislikes } = action.payload;
      return {
        ...state,
        my_dislikes,
      };
    }
    case USER_LOAD_MY_KUDOS: {
      const { my_kudos } = action.payload;
      return {
        ...state,
        my_kudos,
      };
    }
    case USER_LOAD_MY_REPORTS: {
      const { my_reports } = action.payload;
      return {
        ...state,
        my_reports,
      };
    }
    case USER_LOAD_MY_SUBMISSIONS: {
      const { my_submissions } = action.payload;
      return {
        ...state,
        my_submissions,
      };
    }
    case USER_DO_ACTIVITY: {
      const { path, type, aggData, onFinished } = action.payload;
      const data: AggData = {
        ...(aggData || {}),
      };
      if (type === "connects") {
        data.c = state?.settings?.account?.contact;
      }
      const setData = async (): Promise<void> => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const DataStateWrite = (
          await import("../../impower-data-state/classes/dataStateWrite")
        ).default;
        const timestampServerValue = (
          await import("../../impower-data-state/utils/timestampServerValue")
        ).default;
        const incrementServerValue = (
          await import("../../impower-data-state/utils/incrementServerValue")
        ).default;
        const { uid, author } = Auth.instance;
        const aggRef = new DataStateWrite(...path, "agg", type);
        const a = author;
        data.t = timestampServerValue() as number;
        data.a = a;
        try {
          await aggRef.update({
            count: incrementServerValue(1),
            [`data/${uid}`]: data,
          });
          if (type === "connects") {
            const notificationId = `${type}%${path[path.length - 1]}`;
            const notificationsRef = new DataStateWrite(
              "users",
              uid,
              "notifications",
              "data",
              notificationId,
              "r"
            );
            await notificationsRef.set(true);
          }
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      const myActivitiesName = `my_${type}`;
      let myActivities = state?.[myActivitiesName] || {};
      myActivities = { ...myActivities };
      const collectionPath = path.slice(0, -1).join("/");
      const g = collectionPath.split("/").slice(-1).join("");
      const target = path.join("%");
      const t = Date.now();
      myActivities[target] = {
        ...(data || {}),
        g,
        t,
      };
      const parentColId = path[0];
      const parentDocId = path[1];
      const targetColId = path[2];
      let my_recent_pitched_projects = state?.my_recent_pitched_projects;
      if (
        parentColId === "pitched_projects" &&
        type === "kudos" &&
        !targetColId &&
        state?.my_recent_pitched_projects[parentDocId]
      ) {
        my_recent_pitched_projects = {
          ...(my_recent_pitched_projects || {}),
          [parentDocId]: {
            ...(my_recent_pitched_projects?.[parentDocId] || {}),
            kudos: (my_recent_pitched_projects?.[parentDocId]?.kudos || 0) + 1,
          } as ProjectDocument,
        };
      }
      return {
        ...state,
        [myActivitiesName]: myActivities,
        my_recent_pitched_projects,
      };
    }
    case USER_UNDO_ACTIVITY: {
      const { path, type, onFinished } = action.payload;
      const setData = async (): Promise<void> => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const DataStateWrite = (
          await import("../../impower-data-state/classes/dataStateWrite")
        ).default;
        const incrementServerValue = (
          await import("../../impower-data-state/utils/incrementServerValue")
        ).default;
        const { uid } = Auth.instance;
        const aggRef = new DataStateWrite(...path, "agg", type);
        try {
          await aggRef.update({
            count: incrementServerValue(-1),
            [`data/${uid}`]: null,
          });
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      const myActivitiesName = `my_${type}`;
      let myActivities = state?.[myActivitiesName] || {};
      myActivities = { ...myActivities };
      const target = path.join("%");
      if (myActivities[target]) {
        delete myActivities[target];
      }
      const parentColId = path[0];
      const parentDocId = path[1];
      const targetColId = path[2];
      let my_recent_pitched_projects = state?.my_recent_pitched_projects;
      if (
        parentColId === "pitched_projects" &&
        type === "kudos" &&
        !targetColId &&
        state?.my_recent_pitched_projects[parentDocId]
      ) {
        my_recent_pitched_projects = {
          ...(my_recent_pitched_projects || {}),
          [parentDocId]: {
            ...(my_recent_pitched_projects?.[parentDocId] || {}),
            kudos: (my_recent_pitched_projects?.[parentDocId]?.kudos || 0) - 1,
          } as ProjectDocument,
        };
      }
      return {
        ...state,
        [myActivitiesName]: myActivities,
        my_recent_pitched_projects,
      };
    }
    case USER_ACCEPT_CONNECT: {
      const { path, onFinished } = action.payload;
      const type = "connects";
      const data: AggData = {};
      data.c = state?.settings?.account?.contact;
      const id = path?.[path.length - 1];
      const setData = async (): Promise<void> => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const DataStateWrite = (
          await import("../../impower-data-state/classes/dataStateWrite")
        ).default;
        const timestampServerValue = (
          await import("../../impower-data-state/utils/timestampServerValue")
        ).default;
        const incrementServerValue = (
          await import("../../impower-data-state/utils/incrementServerValue")
        ).default;
        const { uid, author } = Auth.instance;
        const aggRef = new DataStateWrite(...path, "agg", type);
        const a = author;
        data.t = timestampServerValue() as number;
        data.a = a;
        try {
          await aggRef.update({
            count: incrementServerValue(1),
            [`data/${uid}`]: data,
          });
          const notificationId = `${type}%${path[path.length - 1]}`;
          const notificationsRef = new DataStateWrite(
            "users",
            uid,
            "notifications",
            "data",
            notificationId,
            "r"
          );
          await notificationsRef.set(true);
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      const myConnects = { ...(state?.my_connects || {}) };
      const collectionPath = path.slice(0, -1).join("/");
      const g = collectionPath.split("/").slice(-1).join("");
      const target = path.join("%");
      const t = Date.now();
      myConnects[target] = {
        ...(data || {}),
        g,
        t,
      };

      return {
        ...state,
        my_connects: myConnects,
        connects: {
          ...(state?.connects || {}),
          [id]: {
            ...(state?.connects?.[id] || {}),
            r: true,
          },
        },
      };
    }
    case USER_REJECT_CONNECT: {
      const { path, onFinished } = action.payload;
      const id = path?.[path.length - 1];
      const setData = async (): Promise<void> => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const DataStateWrite = (
          await import("../../impower-data-state/classes/dataStateWrite")
        ).default;
        const { uid } = Auth.instance;
        const connectsRef = new DataStateWrite(
          "users",
          uid,
          "agg",
          "connects",
          "data",
          id,
          "r"
        );
        const type = "connects";
        const notificationId = `${type}%${id}`;
        const notificationsRef = new DataStateWrite(
          "users",
          uid,
          "notifications",
          "data",
          notificationId,
          "r"
        );
        try {
          await connectsRef.set(true);
          await notificationsRef.set(true);
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      return {
        ...state,
        connects: {
          ...(state?.connects || {}),
          [id]: {
            ...(state?.connects?.[id] || {}),
            r: true,
          },
        },
      };
    }
    case USER_CHANGE_MEMBER: {
      const { path, data, onFinished } = action.payload;
      const setData = async (): Promise<void> => {
        const DataStateWrite = (
          await import("../../impower-data-state/classes/dataStateWrite")
        ).default;
        try {
          const memberRef = new DataStateWrite(...path);
          await memberRef.update(data);
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      let my_studio_memberships = state?.my_studio_memberships || {};
      let my_project_memberships = state?.my_project_memberships || {};
      const id = path[path.length - 1];
      const parentDocId = path[path.length - 4];
      if (id === state?.uid) {
        if (data.g === "studios") {
          my_studio_memberships = { ...my_studio_memberships };
          my_studio_memberships[parentDocId] = data;
        }
        if (data.g === "projects") {
          my_project_memberships = { ...my_project_memberships };
          my_project_memberships[parentDocId] = data;
        }
      }
      return {
        ...state,
        my_studio_memberships,
        my_project_memberships,
      };
    }
    case USER_CREATE_SUBMISSION: {
      const { path, doc, onFinished } = action.payload;
      const submissionType = getSubmissionType(path);
      const setData = async (): Promise<void> => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const DataStoreBatch = (
          await import("../../impower-data-store/classes/dataStoreBatch")
        ).default;
        const DataStoreWrite = (
          await import("../../impower-data-store/classes/dataStoreWrite")
        ).default;
        const { uid } = Auth.instance;
        const batch = await new DataStoreBatch().start();
        await new DataStoreWrite(...path).create(doc, batch);
        try {
          await new DataStoreWrite(
            "users",
            uid,
            "submissions",
            submissionType
          ).update(
            {
              _documentType: "PathDocument",
              _createdBy: uid,
              path: path.join("/"),
            },
            batch
          );
        } catch {
          await new DataStoreWrite(
            "users",
            uid,
            "submissions",
            submissionType
          ).create(
            {
              _documentType: "PathDocument",
              _createdBy: uid,
              path: path.join("/"),
            },
            batch
          );
        }
        try {
          await batch.commit();
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      const newDoc = getLocalCreateAnnotatedDocument(doc);
      let studios = state?.studios;
      let my_likes = state?.my_likes;
      let my_studio_memberships = state?.my_studio_memberships;
      let my_project_memberships = state?.my_project_memberships;
      let my_submissions = state?.my_submissions;
      let my_recent_pages = state?.my_recent_pages;
      let my_recent_published_pages = state?.my_recent_published_pages;
      let my_recent_pitched_projects = state?.my_recent_pitched_projects;
      let my_recent_comments = state?.my_recent_comments;
      let my_recent_contributions = state?.my_recent_contributions;
      const key = path.join("%");
      const id = path[path.length - 1];
      const parentDocId = path[path.length - 3];
      my_submissions = {
        ...(my_submissions || {}),
        [key]: { t: Date.now(), g: submissionType },
      };
      if (isPageDocument(newDoc)) {
        if (isProjectDocument(newDoc) && newDoc.pitchedAt) {
          newDoc.pitchedAt =
            typeof newDoc.pitchedAt === "string"
              ? newDoc.pitchedAt
              : newDoc.pitchedAt.toDate().toJSON();
          if (newDoc.likes === 1) {
            my_likes = {
              ...(my_likes || {}),
              [`pitched_${key}`]: {
                g: submissionType,
                t: Date.now(),
              },
            };
          }
          my_recent_pitched_projects = {
            [id]: newDoc,
            ...(my_recent_pitched_projects || {}),
            [id]: newDoc,
          };
        }
        if (newDoc.publishedAt) {
          newDoc.pitchedAt =
            typeof newDoc.publishedAt === "string"
              ? newDoc.publishedAt
              : newDoc.publishedAt.toDate().toJSON();
          if (newDoc.likes === 1) {
            my_likes = {
              ...(my_likes || {}),
              [`published_${key}`]: {
                g: submissionType,
                t: Date.now(),
              },
            };
          }
          my_recent_published_pages = {
            ...(my_recent_published_pages || {}),
            [id]: newDoc,
          };
        }
        my_recent_pages = { ...(my_recent_pages || {}), [id]: newDoc };
      }
      if (isCommentDocument(newDoc)) {
        if (newDoc.likes === 1) {
          my_likes = {
            ...(my_likes || {}),
            [key]: {
              g: submissionType,
              t: Date.now(),
            },
          };
        }
        my_recent_comments = {
          ...(my_recent_comments || {}),
          [parentDocId]: {
            ...(my_recent_comments?.[parentDocId] || {}),
            [id]: newDoc,
          },
        };
      }
      if (isContributionDocument(newDoc)) {
        if (newDoc.likes === 1) {
          my_likes = {
            ...(my_likes || {}),
            [key]: {
              g: submissionType,
              t: Date.now(),
            },
          };
        }
        if (my_recent_pitched_projects?.[parentDocId]) {
          my_recent_pitched_projects = {
            ...(my_recent_pitched_projects || {}),
            [parentDocId]: {
              ...(my_recent_pitched_projects?.[parentDocId] || {}),
              contributions:
                (my_recent_pitched_projects?.[parentDocId]?.contributions ||
                  0) + 1,
            } as ProjectDocument,
          };
        }
        my_recent_contributions = {
          ...(my_recent_contributions || {}),
          [parentDocId]: {
            ...(my_recent_contributions?.[parentDocId] || {}),
            [id]: newDoc,
          },
        };
      }
      if (submissionType === "studios" && isStudioDocument(newDoc)) {
        studios = { ...(studios || {}), [id]: newDoc };
        my_studio_memberships = {
          ...(my_studio_memberships || {}),
          [id]: {
            access: MemberAccess.Owner,
            role: "",
            accessedAt: Date.now(),
            t: Date.now(),
            g: "studios",
          },
        };
      }
      if (submissionType === "projects" && isProjectDocument(newDoc)) {
        my_project_memberships = {
          ...(my_project_memberships || {}),
          [id]: {
            access: MemberAccess.Owner,
            role: "",
            accessedAt: Date.now(),
            t: Date.now(),
            g: "projects",
          },
        };
      }
      const existingSubmissionDoc = state?.submissions?.[submissionType];
      const newSubmissionDoc = getLocalUpdateAnnotatedDocument(
        existingSubmissionDoc
      );
      return {
        ...state,
        studios,
        my_likes,
        my_studio_memberships,
        my_project_memberships,
        my_submissions,
        my_recent_pages,
        my_recent_published_pages,
        my_recent_pitched_projects,
        my_recent_comments,
        my_recent_contributions,
        submissions: {
          ...state.submissions,
          [submissionType]: newSubmissionDoc,
        },
      };
    }
    case USER_UPDATE_SUBMISSION: {
      const { path, doc, onFinished } = action.payload;
      const submissionType = getSubmissionType(path);
      const setData = async (): Promise<void> => {
        const DataStoreWrite = (
          await import("../../impower-data-store/classes/dataStoreWrite")
        ).default;
        try {
          await new DataStoreWrite(...path).update(doc);
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      const newDoc = getLocalUpdateAnnotatedDocument(doc);
      const userDoc = isUserDocument(doc) ? doc : state?.userDoc;
      let studios = state?.studios;
      let my_studio_memberships = state?.my_studio_memberships;
      let my_project_memberships = state?.my_project_memberships;
      let my_recent_pages = state?.my_recent_pages;
      let my_recent_published_pages = state?.my_recent_published_pages;
      let my_recent_pitched_projects = state?.my_recent_pitched_projects;
      let my_recent_comments = state?.my_recent_comments;
      let my_recent_contributions = state?.my_recent_contributions;
      const id = path[path.length - 1];
      const parentDocId = path[path.length - 3];
      if (isPageDocument(newDoc)) {
        if (isProjectDocument(newDoc) && newDoc.pitchedAt) {
          newDoc.pitchedAt =
            typeof newDoc.pitchedAt === "string"
              ? newDoc.pitchedAt
              : newDoc.pitchedAt.toDate().toJSON();
          if (newDoc.pitched) {
            my_recent_pitched_projects = {
              [id]: newDoc,
              ...(my_recent_pitched_projects || {}),
              [id]: newDoc,
            };
          } else {
            const newDelistedProject = {
              ...newDoc,
              name: "[deleted]",
              summary: "[deleted]",
              _author: {
                u: "[deleted]",
                i: null,
                h: "#FFFFFF",
              },
              delisted: true,
            };
            my_recent_pitched_projects = {
              [id]: newDelistedProject,
              ...(my_recent_pitched_projects || {}),
              [id]: newDelistedProject,
            };
          }
        }
        if (newDoc.published && newDoc.publishedAt) {
          newDoc.publishedAt =
            typeof newDoc.publishedAt === "string"
              ? newDoc.publishedAt
              : newDoc.publishedAt.toDate().toJSON();
          if (newDoc.published) {
            my_recent_published_pages = {
              ...(my_recent_published_pages || {}),
              [id]: newDoc,
            };
          } else {
            my_recent_published_pages = {
              ...(my_recent_published_pages || {}),
              [id]: {
                ...newDoc,
                name: "[deleted]",
                summary: "[deleted]",
                description: "[deleted]",
                statusInformation: "[deleted]",
                icon: { storageKey: "", fileUrl: "" },
                cover: { storageKey: "", fileUrl: "" },
                logo: { storageKey: "", fileUrl: "" },
                _author: {
                  u: "[deleted]",
                  i: null,
                  h: "#FFFFFF",
                },
                delisted: true,
              },
            };
          }
        }
        my_recent_pages = { ...(my_recent_pages || {}), [id]: newDoc };
      }
      if (isStudioDocument(newDoc)) {
        if (newDoc?.owners) {
          if (!newDoc?.owners?.includes(state?.uid)) {
            my_studio_memberships = {
              ...(my_studio_memberships || {}),
              [id]: {
                access: MemberAccess.Owner,
                role: "",
                accessedAt: Date.now(),
                t: Date.now(),
                g: "studios",
              },
            };
          } else {
            my_studio_memberships = {
              ...(my_studio_memberships || {}),
              [id]: null,
            };
          }
        }
      }
      if (isProjectDocument(newDoc)) {
        if (newDoc?.owners) {
          if (!newDoc?.owners?.includes(state?.uid)) {
            my_project_memberships = {
              ...(my_project_memberships || {}),
              [id]: {
                access: MemberAccess.Owner,
                role: "",
                accessedAt: Date.now(),
                t: Date.now(),
                g: "projects",
              },
            };
          } else {
            my_project_memberships = {
              ...(my_project_memberships || {}),
              [id]: null,
            };
          }
        }
      }
      if (isCommentDocument(newDoc)) {
        if (newDoc.deleted) {
          my_recent_comments = {
            ...(my_recent_comments || {}),
            [parentDocId]: {
              ...(my_recent_comments?.[parentDocId] || {}),
              [id]: {
                ...(my_recent_comments?.[parentDocId]?.[id] || {}),
                ...newDoc,
                content: "[deleted]",
                _author: {
                  u: "[deleted]",
                  i: null,
                  h: "#FFFFFF",
                },
              },
            },
          };
        } else {
          my_recent_comments = {
            ...(my_recent_comments || {}),
            [parentDocId]: {
              ...(my_recent_comments?.[parentDocId] || {}),
              [id]: { ...newDoc, delisted: false },
            },
          };
        }
      }
      if (isContributionDocument(newDoc)) {
        if (newDoc.deleted) {
          if (my_recent_pitched_projects?.[parentDocId]) {
            my_recent_pitched_projects = {
              ...(my_recent_pitched_projects || {}),
              [parentDocId]: {
                ...(my_recent_pitched_projects?.[parentDocId] || {}),
                contributions:
                  (my_recent_pitched_projects?.[parentDocId]?.contributions ||
                    0) - 1,
              } as ProjectDocument,
            };
          }
          my_recent_contributions = {
            ...(my_recent_contributions || {}),
            [parentDocId]: {
              ...(my_recent_contributions?.[parentDocId] || {}),
              [id]: {
                ...(my_recent_contributions?.[parentDocId]?.[id] || {}),
                ...newDoc,
                content: "[deleted]",
                file: { storageKey: "", fileUrl: "" },
                _author: {
                  u: "[deleted]",
                  i: null,
                  h: "#FFFFFF",
                },
              },
            },
          };
        } else {
          my_recent_contributions = {
            ...(my_recent_contributions || {}),
            [parentDocId]: {
              ...(my_recent_contributions?.[parentDocId] || {}),
              [id]: { ...newDoc, delisted: false },
            },
          };
        }
      }
      if (isUserDocument(newDoc)) {
        // Update author details across all session submissions
        my_recent_pages = { ...(my_recent_pages || {}) };
        Object.entries(my_recent_pages).forEach(([id, doc]) => {
          my_recent_pages[id] = {
            ...doc,
            _author: {
              ...doc._author,
              u: newDoc.username,
              i: newDoc.icon?.fileUrl,
              h: newDoc.hex,
            },
          };
        });
        my_recent_published_pages = { ...(my_recent_published_pages || {}) };
        Object.entries(my_recent_published_pages).forEach(([id, doc]) => {
          my_recent_published_pages[id] = {
            ...doc,
            _author: {
              ...doc._author,
              u: newDoc.username,
              i: newDoc.icon?.fileUrl,
              h: newDoc.hex,
            },
          };
        });
        my_recent_pitched_projects = { ...(my_recent_pitched_projects || {}) };
        Object.entries(my_recent_pitched_projects).forEach(([id, doc]) => {
          my_recent_pitched_projects[id] = {
            ...doc,
            _author: {
              ...doc._author,
              u: newDoc.username,
              i: newDoc.icon?.fileUrl,
              h: newDoc.hex,
            },
          };
        });
        my_recent_comments = { ...(my_recent_comments || {}) };
        Object.entries(my_recent_comments).forEach(([parentId, children]) => {
          Object.entries(children).forEach(([id, doc]) => {
            my_recent_comments[parentId] = {
              ...(my_recent_comments?.[parentId] || {}),
              [id]: {
                ...doc,
                _author: {
                  ...doc._author,
                  u: newDoc.username,
                  i: newDoc.icon?.fileUrl,
                  h: newDoc.hex,
                },
              },
            };
          });
        });
        my_recent_contributions = { ...(my_recent_contributions || {}) };
        Object.entries(my_recent_contributions).forEach(
          ([parentId, children]) => {
            Object.entries(children).forEach(([id, doc]) => {
              my_recent_contributions[parentId] = {
                ...(my_recent_contributions?.[parentId] || {}),
                [id]: {
                  ...doc,
                  _author: {
                    ...doc._author,
                    u: newDoc.username,
                    i: newDoc.icon?.fileUrl,
                    h: newDoc.hex,
                  },
                },
              };
            });
          }
        );
      }
      if (submissionType === "studios" && isStudioDocument(newDoc)) {
        studios = { ...(studios || {}), [id]: newDoc };
      }
      const existingSubmissionDoc = state?.submissions?.[submissionType];
      const newSubmissionDoc = getLocalUpdateAnnotatedDocument(
        existingSubmissionDoc
      );
      return {
        ...state,
        studios,
        userDoc,
        my_studio_memberships,
        my_project_memberships,
        my_recent_pages,
        my_recent_published_pages,
        my_recent_pitched_projects,
        my_recent_comments,
        my_recent_contributions,
        submissions: {
          ...state.submissions,
          [submissionType]: newSubmissionDoc,
        },
      };
    }
    case USER_DELETE_SUBMISSION: {
      const { path, onFinished } = action.payload;
      const submissionType = getSubmissionType(path);
      const setData = async (): Promise<void> => {
        const DataStoreWrite = (
          await import("../../impower-data-store/classes/dataStoreWrite")
        ).default;
        try {
          await new DataStoreWrite(...path).delete();
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      let studios = state?.studios;
      let my_studio_memberships = state?.my_studio_memberships;
      let my_project_memberships = state?.my_project_memberships;
      let my_recent_pages = state?.my_recent_pages;
      let my_recent_published_pages = state?.my_recent_published_pages;
      let my_recent_pitched_projects = state?.my_recent_pitched_projects;
      let my_recent_comments = state?.my_recent_comments;
      let my_recent_contributions = state?.my_recent_contributions;
      const id = path[path.length - 1];
      const parentDocId = path[path.length - 3];
      if (my_recent_pitched_projects[id]) {
        my_recent_pitched_projects = {
          ...my_recent_pitched_projects,
          [id]: null,
        };
      }
      if (my_recent_published_pages[id]) {
        my_recent_published_pages = {
          ...my_recent_published_pages,
          [id]: null,
        };
      }
      if (my_recent_pages[id]) {
        my_recent_pages = { ...my_recent_pages, [id]: null };
      }
      if (my_recent_comments[parentDocId]) {
        my_recent_comments = { ...my_recent_comments };
        my_recent_comments[parentDocId][id] = null;
      }
      if (my_recent_contributions[parentDocId]) {
        my_recent_contributions = { ...my_recent_contributions };
        my_recent_contributions[parentDocId][id] = null;
      }
      if (submissionType === "studios") {
        studios = { ...(studios || {}), [id]: null };
        my_studio_memberships = {
          ...(my_studio_memberships || {}),
          [id]: null,
        };
      }
      if (submissionType === "projects") {
        my_project_memberships = {
          ...(my_project_memberships || {}),
          [id]: null,
        };
      }
      const existingSubmissionDoc = state?.submissions?.[submissionType];
      const newSubmissionDoc =
        existingSubmissionDoc?.path === path
          ? ({
              _author: existingSubmissionDoc._author,
              _createdBy: existingSubmissionDoc._createdBy,
              _updatedBy: existingSubmissionDoc._updatedBy,
              _createdAt: existingSubmissionDoc._createdAt,
              _updatedAt: existingSubmissionDoc._updatedAt,
              _updates: existingSubmissionDoc._updates,
            } as DataDocument)
          : existingSubmissionDoc;
      return {
        ...state,
        studios,
        my_studio_memberships,
        my_project_memberships,
        my_recent_pages,
        my_recent_published_pages,
        my_recent_pitched_projects,
        my_recent_comments,
        my_recent_contributions,
        submissions: {
          ...state.submissions,
          [submissionType]: newSubmissionDoc,
        },
      };
    }
    case USER_SET_CUSTOMIZATION: {
      const { customizationType, phraseTags, onFinished } = action.payload;
      const existingCustomization = state?.customizations?.[customizationType];
      const newCustomizationDoc = existingCustomization
        ? getLocalUpdateAnnotatedDocument<CustomizationDocument>({
            _documentType: "CustomizationDocument",
            phraseTags,
          })
        : getLocalCreateAnnotatedDocument<CustomizationDocument>({
            _documentType: "CustomizationDocument",
            phraseTags,
          });
      const setData = async (): Promise<void> => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const DataStoreWrite = (
          await import("../../impower-data-store/classes/dataStoreWrite")
        ).default;
        try {
          const { uid } = Auth.instance;
          if (existingCustomization) {
            await new DataStoreWrite(
              "users",
              uid,
              "customizations",
              customizationType
            ).update(newCustomizationDoc);
          } else {
            await new DataStoreWrite(
              "users",
              uid,
              "customizations",
              customizationType
            ).create(newCustomizationDoc);
          }
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      return {
        ...state,
        customizations: {
          ...state.customizations,
          [customizationType]: newCustomizationDoc,
        },
      };
    }
    case USER_SET_SETTING: {
      const { settingsType, doc, onFinished } = action.payload;
      const existingSettings = state?.settings?.[settingsType];
      const newSettingsDoc = existingSettings
        ? getLocalUpdateAnnotatedDocument({
            _documentType: "SettingsDocument",
            ...doc,
          } as SettingsDocument)
        : getLocalCreateAnnotatedDocument({
            _documentType: "SettingsDocument",
            ...doc,
          } as SettingsDocument);
      const setData = async (): Promise<void> => {
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const DataStoreWrite = (
          await import("../../impower-data-store/classes/dataStoreWrite")
        ).default;
        try {
          const { uid } = Auth.instance;
          if (existingSettings) {
            await new DataStoreWrite(
              "users",
              uid,
              "settings",
              settingsType
            ).update(newSettingsDoc);
          } else {
            await new DataStoreWrite(
              "users",
              uid,
              "settings",
              settingsType
            ).create(newSettingsDoc);
          }
        } catch (e) {
          const logWarn = (await import("../../impower-logger/utils/logWarn"))
            .default;
          logWarn("DataState", e);
          errorHandler?.(e.code);
        }
        if (onFinished) {
          onFinished();
        }
      };
      setData();
      return {
        ...state,
        settings: {
          ...state.settings,
          [settingsType]: newSettingsDoc,
        },
      };
    }
    default:
      throw new Error(`Action not recognized: ${action}`);
  }
};
