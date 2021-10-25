import { useContext, useEffect, useMemo, useState } from "react";
import { useConnectionStatus } from "../../impower-data-state";
import {
  NavigationContext,
  navigationHideBanner,
  navigationShowBanner,
} from "../../impower-navigation";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";
import { ProjectEngineSync } from "../types/classes/projectEngineSync";
import { ProjectEngineSyncContextState } from "../types/projectEngineSyncContextState";
import {
  getEngineSyncStatus,
  projectEngineSyncInstructions,
  ProjectEngineSyncInstructionType,
  projectEngineSyncStatusInfo,
} from "../types/projectEngineSyncInfo";

export const useProjectEngineSyncContextState = (
  isLoaded: boolean
): ProjectEngineSyncContextState => {
  const [navigationState, navigationDispatch] = useContext(NavigationContext);
  const [userState] = useContext(UserContext);
  const { isSignedIn, isAnonymous } = userState;
  const router = useRouter();

  const [isSaving, setIsSaving] = useState(false);
  const [isSynced, setIsSynced] = useState(true);

  const isConnected = useConnectionStatus();

  // Track the sync state of the game
  // And inform the user of the current sync state
  useEffect(() => {
    const onGameEngineChange = (): void => {
      setIsSynced(false);
      setIsSaving(true);
      if (isSignedIn === false || isAnonymous) {
        const info =
          projectEngineSyncInstructions[
            ProjectEngineSyncInstructionType.Temporary
          ];
        navigationDispatch(
          navigationShowBanner(
            ProjectEngineSyncInstructionType.Temporary,
            info.message,
            "info",
            info.button
          )
        );
      }
    };
    const onGameEngineSync = (): void => {
      setIsSynced(true);
      setIsSaving(false);
    };
    if (isSignedIn) {
      if (isLoaded) {
        if (
          navigationState.banner?.id ===
          ProjectEngineSyncInstructionType.Temporary
        ) {
          navigationDispatch(navigationHideBanner());
        }
        // The user is authenticated and should be able to sync their changes.
        // Subscribe to change and sync events.
        ProjectEngineSync.instance.onChange.addListener(onGameEngineChange);
        ProjectEngineSync.instance.onSync.addListener(onGameEngineSync);
      }
    }
    return (): void => {
      ProjectEngineSync.instance.onChange.removeListener(onGameEngineChange);
      ProjectEngineSync.instance.onSync.removeListener(onGameEngineSync);
    };
  }, [
    navigationDispatch,
    navigationState.banner?.id,
    isAnonymous,
    isSignedIn,
    isLoaded,
    router,
  ]);

  // If the game is not saved show an "Unsaved Changes" warning popup when navigating away from website
  useEffect(() => {
    const onBeforeUnload = (event): void => {
      if (isSaving) {
        event.preventDefault();
        event.returnValue = true;
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return (): void => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isSaving]);

  const syncStatus = useMemo(
    () =>
      getEngineSyncStatus(
        isLoaded,
        isSignedIn,
        isAnonymous,
        isConnected,
        isSaving,
        isSynced
      ),
    [isLoaded, isSignedIn, isAnonymous, isConnected, isSaving, isSynced]
  );

  const syncStatusMessage = useMemo(
    () => projectEngineSyncStatusInfo[syncStatus],
    [syncStatus]
  );

  return useMemo(
    () => [
      {
        isSynced,
        syncStatus,
        syncStatusMessage,
      },
    ],
    [isSynced, syncStatus, syncStatusMessage]
  );
};
