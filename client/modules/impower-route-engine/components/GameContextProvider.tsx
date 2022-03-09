import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { debounce } from "../../impower-core";
import { useAllDocs } from "../../impower-data-state";
import { ProjectDocument } from "../../impower-data-store";
import {
  FilesCollection,
  GameInstancesCollection,
  GameProjectData,
  GameScriptsCollection,
  MembersCollection,
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
  ProjectEngineSyncContext,
  useProjectData,
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
import {
  panelInspect,
  panelSetInteraction,
} from "../types/actions/panelActions";
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
  background-color: ${(props): string => props.theme.colors.darkForeground};
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

  const handleLoadProjectDoc = useCallback(
    (doc: ProjectDocument) => {
      dispatch(projectLoadDoc(loadedProjectId, doc));
    },
    [dispatch, loadedProjectId]
  );
  const handleLoadProjectMembers = useCallback(
    (members: MembersCollection) => {
      dispatch(projectLoadMembers(loadedProjectId, members));
    },
    [dispatch, loadedProjectId]
  );
  const handleLoadProjectFiles = useCallback(
    async (files: FilesCollection) => {
      await Promise.all(
        Object.entries(files?.data || {}).map(([, fileData]) => {
          return new Promise((resolve) => {
            if (fileData?.fileType?.startsWith("image") && fileData?.blurUrl) {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve;
              img.src = fileData?.blurUrl;
            }
          });
        })
      );
      await Promise.all(
        Object.entries(files?.data || {}).map(([, fileData]) => {
          return new Promise((resolve) => {
            if (fileData?.fileType?.startsWith("image") && fileData?.thumbUrl) {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve;
              img.src = fileData?.thumbUrl;
            }
          });
        })
      );
      await Promise.all(
        Object.entries(files?.data || {}).map(([, fileData]) => {
          return new Promise((resolve) => {
            if (fileData?.fileType?.startsWith("image") && fileData?.fileUrl) {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve;
              img.src = fileData?.fileUrl;
            }
          });
        })
      );
      dispatch(projectLoadFiles(loadedProjectId, files));
    },
    [dispatch, loadedProjectId]
  );
  const handleLoadProjectScripts = useCallback(
    (scripts: GameScriptsCollection) => {
      dispatch(projectLoadScripts(loadedProjectId, scripts));
    },
    [dispatch, loadedProjectId]
  );
  const handleLoadProjectInstances = useCallback(
    (instances: GameInstancesCollection) => {
      dispatch(projectLoadInstances(loadedProjectId, instances));
    },
    [dispatch, loadedProjectId]
  );
  useProjectData(
    loadedProjectId,
    handleLoadProjectDoc,
    handleLoadProjectMembers,
    handleLoadProjectFiles,
    handleLoadProjectScripts,
    handleLoadProjectInstances
  );

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
  const gameProject = state?.project?.data as GameProjectData;
  const projectBlocks = useMemo(
    () =>
      gameProject?.instances?.blocks?.data
        ? Object.values(gameProject?.instances?.blocks?.data || {}).map(
            (doc) => doc
          )
        : [],
    [gameProject?.instances?.blocks?.data]
  );

  const { events } = dataContext;

  useEffect(() => {
    const debounceDelay = 200;
    const onOpenData = debounce((data: { id: string }): void => {
      dispatch(panelInspect("Logic", data.id));
    }, debounceDelay);
    events.onOpenData.addListener(onOpenData);
    return (): void => {
      events.onOpenData.removeListener(onOpenData);
    };
  }, [events, dispatch]);

  useEffect(() => {
    const debounceDelay = 200;
    const onStart = debounce(() => {
      dispatch(panelSetInteraction("Logic", "Selected", []));
    }, debounceDelay);
    const onChangeActiveParentBlock = debounce((data: { id: string }): void => {
      dispatch(panelInspect("Logic", data.id));
    }, debounceDelay);
    const onExecuteBlock = debounce((data: { id: string }): void => {
      const block = projectBlocks[data.id];
      if (block) {
        dispatch(panelSetInteraction("Logic", "Selected", [block.reference]));
      }
      events.onFocusData.emit({ ids: [data.id] });
    }, debounceDelay);
    const onExecuteCommand = debounce(
      (data: { blockId: string; commandId: string }): void => {
        events.onFocusData.emit({ ids: [data.commandId] });
      },
      debounceDelay
    );
    if (game) {
      game.events.onStart.addListener(onStart);
      game.logic.events.onChangeActiveParentBlock.addListener(
        onChangeActiveParentBlock
      );
      game.logic.events.onExecuteBlock.addListener(onExecuteBlock);
      game.logic.events.onExecuteCommand.addListener(onExecuteCommand);
    }
    return (): void => {
      if (game) {
        game.events.onStart.removeListener(onStart);
        game.logic.events.onChangeActiveParentBlock.removeListener(
          onChangeActiveParentBlock
        );
        game.logic.events.onExecuteBlock.removeListener(onExecuteBlock);
        game.logic.events.onExecuteCommand.removeListener(onExecuteCommand);
      }
    };
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

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
