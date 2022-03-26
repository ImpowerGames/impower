import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { debounce } from "../../impower-core";
import { useAllDocs } from "../../impower-data-state";
import { ProjectDocument } from "../../impower-data-store";
import {
  FilesCollection,
  GameInstancesCollection,
  MembersCollection,
  ScriptsCollection,
} from "../../impower-game/data";
import { ImpowerGame } from "../../impower-game/game";
import { ImpowerGameInspector } from "../../impower-game/inspector";
import { ImpowerGameRunner } from "../../impower-game/runner";
import {
  NavigationContext,
  navigationSetLinks,
  navigationSetText,
} from "../../impower-navigation";
import {
  ProjectEngineSync,
  ProjectEngineSyncContext,
  useProjectEngineSyncContextState,
} from "../../impower-project-engine-sync";
import { Fallback } from "../../impower-route";
import PageNotFound from "../../impower-route/components/layouts/PageNotFound";
import { useRouter } from "../../impower-router";
import { UserContext } from "../../impower-user";
import { createDataContextState, DataContext } from "../contexts/dataContext";
import { GameContext } from "../contexts/gameContext";
import { GameInspectorContext } from "../contexts/gameInspectorContext";
import { GameRunnerContext } from "../contexts/gameRunnerContext";
import { ProjectEngineContext } from "../contexts/projectEngineContext";
import { panelInspect } from "../types/actions/panelActions";
import {
  projectAccess,
  projectLoadDoc,
  projectLoadFiles,
  projectLoadInstances,
  projectLoadMembers,
  projectLoadScripts,
} from "../types/actions/projectActions";
import { testModeChange } from "../types/actions/testActions";
import { projectEngineReducer } from "../types/reducers/projectEngineReducer";
import { createProjectEngineState } from "../utils/createProjectEngineState";

const StyledProjectPage = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
`;

interface GameContextProviderProps {
  children: React.ReactNode;
}

const GameContextProvider = React.memo((props: GameContextProviderProps) => {
  const { children } = props;

  const theme = useTheme();

  const router = useRouter();
  const { pid } = router.query;
  const loadedProjectId = Array.isArray(pid) ? pid[0] : pid;

  const [, navigationDispatch] = useContext(NavigationContext);
  const [userState] = useContext(UserContext);
  const my_studio_memberships = userState?.my_studio_memberships;
  const my_project_memberships = userState?.my_project_memberships;

  const projectEngineContext = useReducer(
    projectEngineReducer,
    createProjectEngineState()
  );
  const [state, dispatch] = projectEngineContext;

  const loadedStudioId = state?.project?.data?.doc?.studio;

  const projectEngineSyncContext = useProjectEngineSyncContextState(
    Boolean(state?.project?.id)
  );
  const [projectEngineSyncState] = projectEngineSyncContext;
  const { syncStatusMessage } = projectEngineSyncState;
  const dataContext = useMemo(() => createDataContextState(), []);

  const memberDoc = useMemo(() => {
    if (my_project_memberships === undefined) {
      return undefined;
    }
    if (my_project_memberships === null) {
      return null;
    }
    return my_project_memberships[loadedProjectId];
  }, [loadedProjectId, my_project_memberships]);

  const studioMemberDoc = useMemo(() => {
    if (my_studio_memberships === undefined) {
      return undefined;
    }
    if (my_studio_memberships === null) {
      return null;
    }
    return my_studio_memberships[loadedStudioId];
  }, [loadedStudioId, my_studio_memberships]);

  const access =
    memberDoc?.access ||
    (!state?.project?.data?.doc?.restricted
      ? studioMemberDoc?.access
      : undefined);

  const recentlyAccessedGameIds = useMemo(
    () =>
      my_project_memberships === undefined
        ? undefined
        : my_project_memberships === null
        ? null
        : Object.keys(my_project_memberships),
    [my_project_memberships]
  );
  const recentGameDocs = useAllDocs<ProjectDocument>(
    "projects",
    recentlyAccessedGameIds
  );

  const firstLoadFiles = useRef(true);

  useEffect(() => {
    const onLoadDoc = (doc: ProjectDocument): void => {
      dispatch(projectLoadDoc(loadedProjectId, doc));
    };
    const onLoadMembers = (members: MembersCollection): void => {
      dispatch(projectLoadMembers(loadedProjectId, members));
    };
    const cacheFiles = async (files: FilesCollection): Promise<void> => {
      await Promise.all([
        ...Object.entries(files?.data || {}).map(([, fileData]) => {
          return new Promise((resolve) => {
            if (fileData?.fileType?.startsWith("image") && fileData?.blurUrl) {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve;
              img.src = fileData?.blurUrl;
            }
          });
        }),
        ...Object.entries(files?.data || {}).map(([, fileData]) => {
          return new Promise((resolve) => {
            if (fileData?.fileType?.startsWith("image") && fileData?.thumbUrl) {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve;
              img.src = fileData?.thumbUrl;
            }
          });
        }),
        ...Object.entries(files?.data || {}).map(([, fileData]) => {
          return new Promise((resolve) => {
            if (fileData?.fileType?.startsWith("image") && fileData?.fileUrl) {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve;
              img.src = fileData?.fileUrl;
            }
          });
        }),
      ]);
    };
    const onLoadFiles = (files: FilesCollection): void => {
      dispatch(projectLoadFiles(loadedProjectId, files));
      if (firstLoadFiles.current) {
        firstLoadFiles.current = false;
        cacheFiles(files);
      }
    };
    const onLoadScripts = (scripts: ScriptsCollection): void => {
      dispatch(projectLoadScripts(loadedProjectId, scripts));
    };
    const onLoadInstances = (instances: GameInstancesCollection): void => {
      dispatch(projectLoadInstances(loadedProjectId, instances));
    };

    if (loadedProjectId === undefined) {
      return (): void => null;
    }

    if (!loadedProjectId) {
      onLoadDoc(null);
      onLoadMembers(null);
      onLoadFiles(null);
      onLoadScripts(null);
      onLoadInstances(null);
      return (): void => null;
    }

    let unsubscribeDoc: () => void;
    let unsubscribeMembers: () => void;
    let unsubscribeFiles: () => void;
    let unsubscribeScripts: () => void;
    let unsubscribeInstances: () => void;

    ProjectEngineSync.instance
      .observeDoc(onLoadDoc, "projects", loadedProjectId)
      .then((unsubscribe) => {
        unsubscribeDoc = unsubscribe;
      });
    ProjectEngineSync.instance
      .observeMembers(onLoadMembers, "projects", loadedProjectId)
      .then((unsubscribe) => {
        unsubscribeMembers = unsubscribe;
      });
    ProjectEngineSync.instance
      .observeFiles(onLoadFiles, "projects", loadedProjectId)
      .then((unsubscribe) => {
        unsubscribeFiles = unsubscribe;
      });
    ProjectEngineSync.instance
      .observeScripts(onLoadScripts, "projects", loadedProjectId)
      .then((unsubscribe) => {
        unsubscribeScripts = unsubscribe;
      });
    ProjectEngineSync.instance
      .observeInstances(onLoadInstances, "projects", loadedProjectId)
      .then((unsubscribe) => {
        unsubscribeInstances = unsubscribe;
      });
    return (): void => {
      if (unsubscribeDoc) {
        unsubscribeDoc();
      }
      if (unsubscribeMembers) {
        unsubscribeMembers();
      }
      if (unsubscribeFiles) {
        unsubscribeFiles();
      }
      if (unsubscribeScripts) {
        unsubscribeScripts();
      }
      if (unsubscribeInstances) {
        unsubscribeInstances();
      }
    };
  }, [dispatch, loadedProjectId]);

  useEffect(() => {
    navigationDispatch(
      navigationSetText(
        "GAME",
        state?.project?.data?.doc ? state?.project?.data?.doc?.name : "",
        syncStatusMessage
      )
    );
  }, [navigationDispatch, syncStatusMessage, state?.project?.data?.doc]);

  useEffect(() => {
    const gameLinks = recentGameDocs
      ? Object.entries(recentGameDocs)
          .filter(([key]) => key !== loadedProjectId)
          .map(([key, value]) => ({
            label: value.name,
            link: `/e/p/${key}`,
          }))
      : [];
    navigationDispatch(
      navigationSetLinks([
        ...gameLinks,
        ...(gameLinks.length > 0 ? [{ label: "---", link: "" }] : []),
        { label: "View All Games", link: `/e/s/${loadedStudioId}?t=games` },
      ])
    );
  }, [navigationDispatch, loadedProjectId, recentGameDocs, loadedStudioId]);

  const [game, setGame] = useState<ImpowerGame>();
  const [gameInspector, setGameInspector] = useState<ImpowerGameInspector>(
    ImpowerGameInspector.instance
  );
  const [gameRunner, setGameRunner] = useState<ImpowerGameRunner>(
    ImpowerGameRunner.instance
  );
  const handleCreateGame = useCallback(
    (g?: ImpowerGame) => {
      if (!g) {
        dispatch(testModeChange("Edit"));
      }
      setGame(g);
    },
    [setGame, dispatch]
  );
  const handleCreateInspector = useCallback(
    (i: ImpowerGameInspector) => {
      ImpowerGameInspector.instance = i;
      setGameInspector(ImpowerGameInspector.instance);
    },
    [setGameInspector]
  );
  const handleCreateRunner = useCallback(
    (r: ImpowerGameRunner) => {
      ImpowerGameRunner.instance = r;
      setGameRunner(ImpowerGameRunner.instance);
    },
    [setGameRunner]
  );

  const gameContext = useMemo(
    () => ({ game, onCreateGame: handleCreateGame }),
    [game, handleCreateGame]
  );
  const inspectorContext = useMemo(
    () => ({ gameInspector, onCreateInspector: handleCreateInspector }),
    [gameInspector, handleCreateInspector]
  );
  const runnerContext = useMemo(
    () => ({ gameRunner, onCreateRunner: handleCreateRunner }),
    [gameRunner, handleCreateRunner]
  );

  const { events } = dataContext;

  useEffect(() => {
    const debounceDelay = 200;
    const onOpenData = debounce((data: { id: string }): void => {
      dispatch(panelInspect("logic", data.id));
    }, debounceDelay);
    events.onOpenData.addListener(onOpenData);
    return (): void => {
      events.onOpenData.removeListener(onOpenData);
    };
  }, [events, dispatch]);

  useEffect(() => {
    dispatch(projectAccess(access));
  }, [access, dispatch]);

  const loading =
    !access ||
    !loadedStudioId ||
    !loadedProjectId ||
    !state?.project?.id ||
    state?.project?.data === undefined ||
    state?.project?.data?.doc === undefined ||
    state?.project?.data?.files === undefined ||
    state?.project?.data?.scripts === undefined ||
    state?.project?.data?.instances === undefined;

  if (process.env.NEXT_PUBLIC_ENVIRONMENT === "production") {
    return null;
  }

  if (state?.project?.id === "" || state?.project?.data === null) {
    return (
      <StyledProjectPage>
        <PageNotFound />
      </StyledProjectPage>
    );
  }

  if (loading) {
    return (
      <StyledProjectPage>
        <Fallback
          color="secondary"
          style={{ backgroundColor: theme.colors.darkForeground }}
        />
      </StyledProjectPage>
    );
  }

  return (
    <ProjectEngineSyncContext.Provider value={projectEngineSyncContext}>
      <ProjectEngineContext.Provider value={projectEngineContext}>
        <DataContext.Provider value={dataContext}>
          <GameInspectorContext.Provider value={inspectorContext}>
            <GameRunnerContext.Provider value={runnerContext}>
              <GameContext.Provider value={gameContext}>
                {children}
              </GameContext.Provider>
            </GameRunnerContext.Provider>
          </GameInspectorContext.Provider>
        </DataContext.Provider>
      </ProjectEngineContext.Provider>
    </ProjectEngineSyncContext.Provider>
  );
});

export default GameContextProvider;
