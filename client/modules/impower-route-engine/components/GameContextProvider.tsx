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
  panelChangeItemSection,
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
import { createProjectEngineState } from "../types/utils/createProjectEngineState";

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

  const router = useRouter();
  const { pid } = router.query;
  const [, navigationDispatch] = useContext(NavigationContext);
  const [userState] = useContext(UserContext);
  const { my_studio_memberships, my_project_memberships } = userState;

  const theme = useTheme();

  const loadedProjectId = Array.isArray(pid) ? pid[0] : pid;

  const projectEngineContext = useReducer(
    projectEngineReducer,
    createProjectEngineState()
  );
  const [projectEngineState, projectEngineDispatch] = projectEngineContext;
  const projectEngineSyncContext = useProjectEngineSyncContextState(
    Boolean(projectEngineState.project.id)
  );
  const [projectEngineSyncState] = projectEngineSyncContext;
  const { syncStatusMessage } = projectEngineSyncState;
  const dataContext = useMemo(() => createDataContextState(), []);

  const loadedStudioId = projectEngineState?.project?.data?.doc?.studio;

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
      projectEngineDispatch(projectLoadDoc(loadedProjectId, doc));
    },
    [projectEngineDispatch, loadedProjectId]
  );
  const handleLoadProjectMembers = useCallback(
    (members: MembersCollection) => {
      projectEngineDispatch(projectLoadMembers(loadedProjectId, members));
    },
    [projectEngineDispatch, loadedProjectId]
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
      projectEngineDispatch(projectLoadFiles(loadedProjectId, files));
    },
    [projectEngineDispatch, loadedProjectId]
  );
  const handleLoadProjectScripts = useCallback(
    (scripts: GameScriptsCollection) => {
      projectEngineDispatch(projectLoadScripts(loadedProjectId, scripts));
    },
    [projectEngineDispatch, loadedProjectId]
  );
  const handleLoadProjectInstances = useCallback(
    (instances: GameInstancesCollection) => {
      projectEngineDispatch(projectLoadInstances(loadedProjectId, instances));
    },
    [projectEngineDispatch, loadedProjectId]
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
        projectEngineState.project.data?.doc
          ? projectEngineState.project.data?.doc?.name
          : "",
        syncStatusMessage
      )
    );
  }, [
    navigationDispatch,
    syncStatusMessage,
    projectEngineState.project.data?.doc,
  ]);

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
        projectEngineDispatch(testModeChange("Edit"));
      }
      setGame(g);
    },
    [setGame, projectEngineDispatch]
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
  const gameProject = projectEngineState.project.data as GameProjectData;
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
      projectEngineDispatch(panelInspect("Logic", "Container", data.id));
      projectEngineDispatch(panelChangeItemSection("Logic", "Command"));
    }, debounceDelay);
    events.onOpenData.addListener(onOpenData);
    return (): void => {
      events.onOpenData.removeListener(onOpenData);
    };
  }, [events, projectEngineDispatch]);

  useEffect(() => {
    const debounceDelay = 200;
    const onStart = debounce(() => {
      projectEngineDispatch(
        panelSetInteraction("Logic", "Selected", "Container", [])
      );
      projectEngineDispatch(
        panelSetInteraction("Logic", "Selected", "Item", [])
      );
    }, debounceDelay);
    const onChangeActiveParentBlock = debounce((data: { id: string }): void => {
      projectEngineDispatch(panelInspect("Logic", "Container", data.id));
    }, debounceDelay);
    const onExecuteBlock = debounce((data: { id: string }): void => {
      const block = projectBlocks[data.id];
      if (block) {
        projectEngineDispatch(
          panelSetInteraction("Logic", "Selected", "Container", [
            block.reference,
          ])
        );
      }
      projectEngineDispatch(panelChangeItemSection("Logic", "Command"));
      events.onFocusData.emit({ ids: [data.id] });
    }, debounceDelay);
    const onExecuteCommand = debounce(
      (data: { blockId: string; commandId: string }): void => {
        const block = projectBlocks[data.blockId];
        if (block) {
          const command = block.commands.data[data.commandId];
          if (command) {
            projectEngineDispatch(
              panelSetInteraction("Logic", "Selected", "Item", [
                command.reference,
              ])
            );
          }
        }
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

  const access =
    memberDoc?.access ||
    (!projectEngineState?.project?.data?.doc?.restricted
      ? studioMemberDoc?.access
      : undefined);

  useEffect(() => {
    projectEngineDispatch(projectAccess(access));
  }, [access, projectEngineDispatch]);

  const loading =
    !access ||
    !loadedStudioId ||
    !loadedProjectId ||
    !projectEngineState.project.id ||
    projectEngineState.project.data === undefined ||
    projectEngineState.project.data?.doc === undefined ||
    projectEngineState.project.data?.files === undefined ||
    projectEngineState.project.data?.scripts === undefined ||
    projectEngineState.project.data?.instances === undefined;

  if (process.env.NEXT_PUBLIC_ENVIRONMENT === "production") {
    return null;
  }

  if (
    projectEngineState.project.id === "" ||
    projectEngineState.project.data === null
  ) {
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
