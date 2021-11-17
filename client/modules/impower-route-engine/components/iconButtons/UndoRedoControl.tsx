import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import IconButton from "@material-ui/core/IconButton";
import React, { useCallback, useContext } from "react";
import RotateLeftRegularIcon from "../../../../resources/icons/regular/rotate-left.svg";
import RotateRightRegularIcon from "../../../../resources/icons/regular/rotate-right.svg";
import { FontIcon } from "../../../impower-icon";
import { ProjectEngineSync } from "../../../impower-project-engine-sync";
import FadeAnimation from "../../../impower-route/components/animations/FadeAnimation";
import UnmountAnimation from "../../../impower-route/components/animations/UnmountAnimation";
import { ToastContext, toastLeft } from "../../../impower-toast";
import {
  useRedoShortcuts,
  useUndoRedo,
  useUndoRedoAvailability,
  useUndoShortcuts,
} from "../../../impower-undo-redo";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { ProjectState } from "../../types/state/projectState";

const StyledUndoRedoArea = styled(FadeAnimation)`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledLeftButtonBackground = styled.div`
  border-radius: ${(props): string => props.theme.spacing(2)} 0 0
    ${(props): string => props.theme.spacing(2)};
`;

const StyledRightButtonBackground = styled.div`
  border-radius: 0 ${(props): string => props.theme.spacing(2)}
    ${(props): string => props.theme.spacing(2)} 0;
`;

const syncProjectHistoryChange = (
  lastActionTargets: string[],
  newProjectState: ProjectState,
  currentProjectState: ProjectState
): void => {
  const id = newProjectState.id || currentProjectState.id;
  const projectPath = `${id}`;
  if (lastActionTargets.length === 1 && lastActionTargets[0] === projectPath) {
    ProjectEngineSync.instance.syncDoc(
      newProjectState?.data?.doc,
      "projects",
      id
    );
  } else {
    ProjectEngineSync.instance.syncData(
      newProjectState.data,
      currentProjectState.data,
      "projects",
      id
    );
  }
};

const UndoRedoControl = React.memo((): JSX.Element | null => {
  const [gameEngineState, gameEngineDispatch] =
    useContext(ProjectEngineContext);
  const [, toastDispatch] = useContext(ToastContext);
  const { canUndo, canRedo } = useUndoRedoAvailability(gameEngineState);
  const onUndo = useCallback(() => {
    const currentState = gameEngineState.present;
    const newState = gameEngineState.past[gameEngineState.past.length - 1];
    syncProjectHistoryChange(
      currentState.project.lastActionTargets,
      newState.project,
      currentState.project
    );
    const { lastActionDescription } = currentState.project;
    toastDispatch(toastLeft(`UNDO: ${lastActionDescription}`));
  }, [gameEngineState, toastDispatch]);
  const onRedo = useCallback(() => {
    const currentState = gameEngineState.present;
    const newState = gameEngineState.future[0];
    syncProjectHistoryChange(
      newState.project.lastActionTargets,
      newState.project,
      currentState.project
    );
    const { lastActionDescription } = currentState.project;
    toastDispatch(toastLeft(`UNDO: ${lastActionDescription}`));
  }, [gameEngineState, toastDispatch]);
  const { undo, redo } = useUndoRedo(
    gameEngineState,
    gameEngineDispatch,
    onUndo,
    onRedo
  );
  const theme = useTheme();

  useUndoShortcuts(undo);
  useRedoShortcuts(redo);

  if (canUndo || canRedo) {
    return (
      <UnmountAnimation>
        <StyledUndoRedoArea
          className={StyledUndoRedoArea.displayName}
          initial={0}
          animate={1}
          exit={0}
          duration={0.3}
        >
          <StyledLeftButtonBackground
            className={StyledLeftButtonBackground.displayName}
          >
            <IconButton
              onClick={undo}
              style={{
                pointerEvents: canUndo ? "auto" : "none",
                color: canUndo
                  ? theme.palette.secondary.main
                  : theme.colors.white10,
              }}
            >
              <FontIcon aria-label="Undo" size={theme.fontSize.smallIcon}>
                <RotateRightRegularIcon />
              </FontIcon>
            </IconButton>
          </StyledLeftButtonBackground>
          <StyledRightButtonBackground
            className={StyledRightButtonBackground.displayName}
          >
            <IconButton
              onClick={redo}
              style={{
                pointerEvents: canRedo ? "auto" : "none",
                color: canRedo
                  ? theme.palette.secondary.main
                  : theme.colors.white10,
              }}
            >
              <FontIcon aria-label="Redo" size={theme.fontSize.smallIcon}>
                <RotateLeftRegularIcon />
              </FontIcon>
            </IconButton>
          </StyledRightButtonBackground>
        </StyledUndoRedoArea>
      </UnmountAnimation>
    );
  }
  return null;
});

export default UndoRedoControl;
