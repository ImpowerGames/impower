import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  CustomizationType,
  SettingsType,
  SubmissionType,
} from "../../impower-api";
import { User, UserAttributes, UserClaims } from "../../impower-auth";
import getUserAttributes from "../../impower-auth/utils/getUserAttributes";
import getUserClaims from "../../impower-auth/utils/getUserClaims";
import onAuthStateChanged from "../../impower-auth/utils/onAuthStateChanged";
import onIdTokenChanged from "../../impower-auth/utils/onIdTokenChanged";
import {
  AggData,
  MemberData,
  useAllDocsLoad,
  useCollectionDataLoad,
  useObservedCollectionDataLoad,
} from "../../impower-data-state";
import {
  CustomizationDocument,
  PathDocument,
  SettingsDocument,
  StudioDocument,
  UserDocument,
  useUserCustomizationsCollectionLoad,
  useUserSettingsCollectionLoad,
  useUserSubmissionsCollectionLoad,
} from "../../impower-data-store";
import { useDocumentLoad } from "../../impower-data-store/hooks/useDocumentLoad";
import getToday from "../../impower-data-store/utils/getToday";
import { logInfo } from "../../impower-logger";
import { ToastContextState, toastTop } from "../../impower-toast";
import { USER_CREATE_SUBMISSION } from "../types/actions/userCreateSubmissionAction";
import { UserAction } from "../types/userActions";
import { UserContextState } from "../types/userContextState";
import { getSubmissionType, userReducer } from "../types/userReducer";
import { UserState } from "../types/userState";
import createUserState from "../utils/createUserState";
import userLoadConnects from "../utils/userLoadConnects";
import userLoadCustomizations from "../utils/userLoadCustomizations";
import userLoadFollows from "../utils/userLoadFollows";
import userLoadMyConnects from "../utils/userLoadMyConnects";
import userLoadMyDislikes from "../utils/userLoadMyDislikes";
import userLoadMyFollows from "../utils/userLoadMyFollows";
import userLoadMyKudos from "../utils/userLoadMyKudos";
import userLoadMyLikes from "../utils/userLoadMyLikes";
import userLoadMyMemberships from "../utils/userLoadMyMemberships";
import userLoadMySubmissions from "../utils/userLoadMySubmissions";
import userLoadSettings from "../utils/userLoadSettings";
import userLoadStudios from "../utils/userLoadStudios";
import userLoadSubmissions from "../utils/userLoadSubmissions";
import userLoadUserDoc from "../utils/userLoadUserDoc";

export const useUserContextState = (
  toastContext: ToastContextState
): UserContextState => {
  const [attributes, setAttributes] = useState<UserAttributes>({});
  const [claims, setClaims] = useState<UserClaims>({
    username: undefined,
    icon: undefined,
    dob: undefined,
    captcha_time: undefined,
    storage: undefined,
  });

  const [, toastDispatch] = toastContext;

  const myConnectsRef = useRef<{
    [docId: string]: AggData;
  }>();

  const uid = attributes?.uid;

  const isSignedIn = uid === undefined ? undefined : Boolean(uid);

  const wrappedUserReducer = useCallback(
    (state: UserState, action: UserAction): UserState => {
      switch (action.type) {
        case USER_CREATE_SUBMISSION: {
          const { path } = action.payload;
          const type = getSubmissionType(path);
          const today = getToday().toString();
          const limit = type === "comments" ? 300 : 100;
          if (state?.submissions?.[type]?._updates?.[today] >= limit) {
            toastDispatch(
              toastTop(
                "We've detected spam-like behavior on your account. Try again tomorrow",
                "warning"
              )
            );
            return state;
          }
          break;
        }
        default:
          break;
      }
      const errorHandler = (error: string): void =>
        toastDispatch(toastTop(`Something went wrong: ${error}`, "error"));
      return userReducer(state, action, errorHandler);
    },
    [toastDispatch]
  );

  const [state, dispatch] = useReducer(wrappedUserReducer, createUserState());

  const handleLoadUserDocument = useCallback((userDoc: UserDocument) => {
    dispatch(userLoadUserDoc(userDoc));
  }, []);
  useDocumentLoad<UserDocument>(handleLoadUserDocument, "users", uid);

  const { my_studio_memberships } = state;

  const studioIds = useMemo(
    () =>
      my_studio_memberships === undefined
        ? undefined
        : my_studio_memberships === null
        ? null
        : Object.keys(my_studio_memberships),
    [my_studio_memberships]
  );

  const handleLoadStudios = useCallback(
    (studios: { [id: string]: StudioDocument }) => {
      dispatch(userLoadStudios(studios));
    },
    []
  );
  useAllDocsLoad<StudioDocument>(handleLoadStudios, "studios", studioIds);

  const handleLoadSubmissions = useCallback(
    (submissions: {
      [submissionType in SubmissionType]: PathDocument;
    }) => {
      dispatch(userLoadSubmissions(submissions));
    },
    []
  );
  useUserSubmissionsCollectionLoad(handleLoadSubmissions, uid);

  const handleLoadCustomizations = useCallback(
    (customizations: {
      [customizationType in CustomizationType]: CustomizationDocument;
    }) => {
      dispatch(userLoadCustomizations(customizations));
    },
    []
  );
  useUserCustomizationsCollectionLoad(handleLoadCustomizations, uid);

  const handleLoadSettings = useCallback(
    (settings: {
      [settingsType in SettingsType]: SettingsDocument;
    }) => {
      dispatch(
        userLoadSettings(settings === null ? { account: null } : settings)
      );
    },
    []
  );
  useUserSettingsCollectionLoad(handleLoadSettings, uid);

  const handleLoadFollows = useCallback(
    async (
      data: {
        [uid: string]: AggData;
      },
      added: string[]
    ) => {
      dispatch(userLoadFollows(data || {}));
      if (!data) {
        return;
      }
      if (!added) {
        return;
      }
      const newFollows: {
        [uid: string]: AggData;
      } = {};
      added.forEach((otherUid) => {
        if (otherUid) {
          const aggData = data?.[otherUid];
          if (!aggData?.r) {
            newFollows[otherUid] = aggData;
          }
        }
      });
      const newFollowEntries = Object.entries(newFollows);
      const addedUsers = newFollowEntries.map(([, d]) => d?.a?.u);
      if (addedUsers.length > 1) {
        toastDispatch(
          toastTop(
            `${addedUsers[0]} +${
              addedUsers.length - 1
            }others started following you!`
          )
        );
      } else if (addedUsers.length === 1) {
        toastDispatch(toastTop(`${addedUsers[0]} started following you!`));
      }
      const DataStateWrite = (
        await import("../../impower-data-state/classes/dataStateWrite")
      ).default;
      await Promise.all([
        ...newFollowEntries.map(([id]) =>
          new DataStateWrite(
            "users",
            uid,
            "agg",
            "follows",
            "data",
            id,
            "r"
          ).set(true)
        ),
      ]);
    },
    [toastDispatch, uid]
  );
  useObservedCollectionDataLoad(
    handleLoadFollows,
    { orderByChild: "t" },
    "users",
    uid,
    "agg",
    "follows",
    "data"
  );

  const handleLoadConnects = useCallback(
    async (data: { [uid: string]: AggData }, added: string[]) => {
      dispatch(userLoadConnects(data));
      if (!added) {
        return;
      }
      const myConnects = myConnectsRef.current || {};
      const requitedUsers: {
        [uid: string]: AggData;
      } = {};
      const requestedUsers: {
        [uid: string]: AggData;
      } = {};
      if (myConnects) {
        Object.keys(myConnects).forEach((docId) => {
          if (docId) {
            if (added.includes(docId)) {
              const aggData = data?.[docId];
              if (!aggData?.r) {
                requitedUsers[docId] = aggData;
              }
            }
          }
        });
        added.forEach((otherUid) => {
          if (otherUid) {
            if (!myConnects?.[otherUid]) {
              const aggData = data?.[otherUid];
              if (!aggData?.r) {
                requestedUsers[otherUid] = aggData;
              }
            }
          }
        });
      }
      const requitedUserEntries = Object.entries(requitedUsers || {});
      const requitedUserValues = requitedUserEntries.map(([, v]) => v);
      const firstRequitedUser = requitedUserValues?.[0]?.a?.u;
      if (firstRequitedUser) {
        if (requitedUserValues.length > 1) {
          toastDispatch(
            toastTop(
              `${firstRequitedUser} +${
                requitedUserValues.length - 1
              }others want to connect`
            )
          );
        } else {
          toastDispatch(toastTop(`${firstRequitedUser} wants to connect`));
        }
      }
      const requestedUserEntries = Object.entries(requestedUsers || {});
      const requestedUserValues = requestedUserEntries.map(([, v]) => v);
      const firstRequestedUser = requestedUserValues?.[0]?.a?.u;
      if (firstRequestedUser) {
        if (requestedUserValues.length > 1) {
          toastDispatch(
            toastTop(
              `${firstRequestedUser} +${
                requestedUserValues.length - 1
              }others want to connect`
            )
          );
        } else {
          toastDispatch(toastTop(`${firstRequestedUser} wants to connect`));
        }
      }
      const DataStateWrite = (
        await import("../../impower-data-state/classes/dataStateWrite")
      ).default;
      await Promise.all([
        ...requitedUserEntries.map(([id]) =>
          new DataStateWrite(
            "users",
            uid,
            "agg",
            "connects",
            "data",
            id,
            "r"
          ).set(true)
        ),
        ...requestedUserEntries.map(([id]) =>
          new DataStateWrite(
            "users",
            uid,
            "agg",
            "connects",
            "data",
            id,
            "r"
          ).set(true)
        ),
      ]);
    },
    [toastDispatch, uid]
  );
  useObservedCollectionDataLoad(
    handleLoadConnects,
    { orderByChild: "t" },
    "users",
    uid,
    "agg",
    "connects",
    "data"
  );

  const handleLoadMySubmissions = useCallback(
    (all: { [docId: string]: AggData }) => {
      dispatch(userLoadMySubmissions(all));
    },
    []
  );
  useCollectionDataLoad(
    handleLoadMySubmissions,
    { orderByChild: "t" },
    "users",
    uid,
    "agg",
    "my_submissions",
    "data"
  );

  const handleLoadMyMemberships = useCallback(
    (all: { [docId: string]: MemberData }) => {
      dispatch(userLoadMyMemberships(all));
    },
    []
  );
  useCollectionDataLoad(
    handleLoadMyMemberships,
    { orderByChild: "t" },
    "users",
    uid,
    "agg",
    "my_memberships",
    "data"
  );

  const handleLoadMyFollows = useCallback(
    (all: { [docId: string]: AggData }) => {
      dispatch(userLoadMyFollows(all));
    },
    []
  );
  useCollectionDataLoad(
    handleLoadMyFollows,
    { orderByChild: "t" },
    "users",
    uid,
    "agg",
    "my_follows",
    "data"
  );

  const handleLoadMyConnects = useCallback(
    (all: { [docId: string]: AggData }) => {
      dispatch(userLoadMyConnects(all));
      myConnectsRef.current = all;
    },
    []
  );
  useCollectionDataLoad(
    handleLoadMyConnects,
    { orderByChild: "t" },
    "users",
    uid,
    "agg",
    "my_connects",
    "data"
  );

  const handleLoadMyKudos = useCallback((all: { [docId: string]: AggData }) => {
    dispatch(userLoadMyKudos(all));
  }, []);
  useCollectionDataLoad(
    handleLoadMyKudos,
    { orderByChild: "t" },
    "users",
    uid,
    "agg",
    "my_kudos",
    "data"
  );

  const handleLoadMyLikes = useCallback((all: { [docId: string]: AggData }) => {
    dispatch(userLoadMyLikes(all));
  }, []);
  useCollectionDataLoad(
    handleLoadMyLikes,
    { orderByChild: "t" },
    "users",
    uid,
    "agg",
    "my_likes",
    "data"
  );

  const handleLoadMyDislikes = useCallback(
    (all: { [docId: string]: AggData }) => {
      dispatch(userLoadMyDislikes(all));
    },
    []
  );
  useCollectionDataLoad(
    handleLoadMyDislikes,
    { orderByChild: "t" },
    "users",
    uid,
    "agg",
    "my_dislikes",
    "data"
  );

  useEffect(() => {
    const loadUser = async (user: User): Promise<User> => {
      const attr = getUserAttributes(user);
      logInfo("Auth", `LOAD USER: ${user?.uid}`, attr, user);
      setAttributes(attr);
      const claims = await getUserClaims(user);
      setClaims(claims);
      return user;
    };
    const loadClaims = async (user: User): Promise<User> => {
      if (user) {
        const claims = await getUserClaims(user);
        setClaims(claims);
      }
      return user;
    };
    const unsubscribeAuthState = onAuthStateChanged(loadUser);
    const unsubscribeTokenChanged = onIdTokenChanged(loadClaims);
    return (): void => {
      unsubscribeAuthState?.();
      unsubscribeTokenChanged?.();
    };
  }, []);

  return useMemo(
    () => [
      {
        ...attributes,
        ...state,
        claims,
        uid,
        isSignedIn,
      },
      dispatch,
    ],
    [attributes, state, claims, uid, isSignedIn]
  );
};
