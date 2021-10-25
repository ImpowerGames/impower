import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { debounce } from "../../impower-core";
import { useAllDocs } from "../../impower-data-state";
import { GameDocument } from "../../impower-data-store";
import { GameProjectData, ItemType } from "../../impower-game/data";
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
import { useUndoRedo } from "../../impower-undo-redo";
import { useUndoableReducer } from "../../impower-undo-redo/hooks/useUndoableReducer";
import { UserContext } from "../../impower-user";
import { createDataContextState, DataContext } from "../contexts/dataContext";
import { GameContext } from "../contexts/gameContext";
import { GameInspectorContext } from "../contexts/gameInspectorContext";
import { GameRunnerContext } from "../contexts/gameRunnerContext";
import { ProjectEngineContext } from "../contexts/projectEngineContext";
import {
  dataPanelChangeItemSection,
  dataPanelInspect,
  dataPanelSetInteraction,
} from "../types/actions/dataPanelActions";
import {
  projectAccess,
  projectLoadData,
} from "../types/actions/projectActions";
import { testModeChange } from "../types/actions/testActions";
import {
  projectEngineReducer,
  projectEngineUndoRedoConfig,
} from "../types/reducers/projectEngineReducer";
import {
  DataInteractionType,
  DataPanelType,
  DataWindowType,
} from "../types/state/dataPanelState";
import { createProjectEngineState } from "../types/state/projectEngineState";
import { Mode } from "../types/state/testState";

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
  const { gid } = router.query;
  const [, navigationDispatch] = useContext(NavigationContext);
  const [userState] = useContext(UserContext);
  const { my_studio_memberships, my_game_memberships } = userState;

  const theme = useTheme();

  const loadedGameId = Array.isArray(gid) ? gid[0] : gid;

  const projectEngineContext = useUndoableReducer(
    projectEngineReducer,
    createProjectEngineState(),
    projectEngineUndoRedoConfig
  );
  const [projectEngineState, projectEngineDispatch] = projectEngineContext;
  useUndoRedo(projectEngineState, projectEngineDispatch);
  const projectEngineSyncContext = useProjectEngineSyncContextState(
    Boolean(projectEngineState.present.project.id)
  );
  const [projectEngineSyncState] = projectEngineSyncContext;
  const { syncStatusMessage } = projectEngineSyncState;
  const dataContext = useMemo(() => createDataContextState(), []);

  const loadedStudioId =
    projectEngineState?.present?.project?.data?.doc?.studio;

  const memberDoc = useMemo(() => {
    if (my_game_memberships === undefined) {
      return undefined;
    }
    if (my_game_memberships === null) {
      return null;
    }
    return my_game_memberships[loadedGameId];
  }, [loadedGameId, my_game_memberships]);

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
      my_game_memberships === undefined
        ? undefined
        : my_game_memberships === null
        ? null
        : Object.keys(my_game_memberships),
    [my_game_memberships]
  );
  const recentGameDocs = useAllDocs<GameDocument>(
    "games",
    recentlyAccessedGameIds
  );

  const handleLoadProjectData = useCallback(
    (data: GameProjectData) => {
      projectEngineDispatch(projectLoadData("games", loadedGameId, data));
    },
    [projectEngineDispatch, loadedGameId]
  );
  useProjectData("games", loadedGameId, handleLoadProjectData);

  useEffect(() => {
    navigationDispatch(
      navigationSetText(
        "GAME",
        projectEngineState.present.project.data?.doc
          ? projectEngineState.present.project.data?.doc?.name
          : "",
        syncStatusMessage
      )
    );
  }, [
    navigationDispatch,
    syncStatusMessage,
    projectEngineState.present.project.data?.doc,
  ]);

  useEffect(() => {
    const gameLinks = recentGameDocs
      ? Object.entries(recentGameDocs)
          .filter(([key]) => key !== loadedGameId)
          .map(([key, value]) => ({
            label: value.name,
            link: `/e/g/${key}`,
          }))
      : [];
    navigationDispatch(
      navigationSetLinks([
        ...gameLinks,
        ...(gameLinks.length > 0 ? [{ label: "---", link: "" }] : []),
        { label: "View All Games", link: `/e/s/${loadedStudioId}?t=games` },
      ])
    );
  }, [navigationDispatch, loadedGameId, recentGameDocs, loadedStudioId]);

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
        projectEngineDispatch(testModeChange(Mode.Edit));
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
  const gameProject = projectEngineState.present.project
    .data as GameProjectData;
  const projectBlocks = useMemo(
    () =>
      gameProject?.instances?.blocks?.data
        ? Object.values(gameProject?.instances?.blocks?.data).map((doc) => doc)
        : [],
    [gameProject?.instances?.blocks?.data]
  );

  const { events } = dataContext;

  useEffect(() => {
    const debounceDelay = 200;
    const onOpenData = debounce((data: { id: string }): void => {
      projectEngineDispatch(
        dataPanelInspect(DataWindowType.Logic, DataPanelType.Container, data.id)
      );
      projectEngineDispatch(
        dataPanelChangeItemSection(DataWindowType.Logic, ItemType.Command)
      );
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
        dataPanelSetInteraction(
          DataWindowType.Logic,
          DataInteractionType.Selected,
          DataPanelType.Container,
          []
        )
      );
      projectEngineDispatch(
        dataPanelSetInteraction(
          DataWindowType.Logic,
          DataInteractionType.Selected,
          DataPanelType.Item,
          []
        )
      );
    }, debounceDelay);
    const onChangeActiveParentBlock = debounce((data: { id: string }): void => {
      projectEngineDispatch(
        dataPanelInspect(DataWindowType.Logic, DataPanelType.Container, data.id)
      );
    }, debounceDelay);
    const onExecuteBlock = debounce((data: { id: string }): void => {
      const block = projectBlocks[data.id];
      if (block) {
        projectEngineDispatch(
          dataPanelSetInteraction(
            DataWindowType.Logic,
            DataInteractionType.Selected,
            DataPanelType.Container,
            [block.reference]
          )
        );
      }
      projectEngineDispatch(
        dataPanelChangeItemSection(DataWindowType.Logic, ItemType.Command)
      );
      events.onFocusData.emit({ ids: [data.id] });
    }, debounceDelay);
    const onExecuteCommand = debounce(
      (data: { blockId: string; commandId: string }): void => {
        const block = projectBlocks[data.blockId];
        if (block) {
          const command = block.commands.data[data.commandId];
          if (command) {
            projectEngineDispatch(
              dataPanelSetInteraction(
                DataWindowType.Logic,
                DataInteractionType.Selected,
                DataPanelType.Item,
                [command.reference]
              )
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
    (!projectEngineState?.present?.project?.data?.doc?.restricted
      ? studioMemberDoc?.access
      : undefined);

  useEffect(() => {
    projectEngineDispatch(projectAccess(access));
  }, [access, projectEngineDispatch]);

  const loading =
    !access ||
    !loadedStudioId ||
    !loadedGameId ||
    !projectEngineState.present.project.id ||
    projectEngineState.present.project.data === undefined;

  if (process.env.NEXT_PUBLIC_ENVIRONMENT !== "development") {
    return null;
  }

  if (
    projectEngineState.present.project.id === "" ||
    projectEngineState.present.project.data === null
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
