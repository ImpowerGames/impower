import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import IconButton from "@material-ui/core/IconButton";
import React, { useCallback, useContext } from "react";
import RotateLeftRegularIcon from "../../../../resources/icons/regular/rotate-left.svg";
import RotateRightRegularIcon from "../../../../resources/icons/regular/rotate-right.svg";
import { FontIcon } from "../../../impower-icon";
import FadeAnimation from "../../../impower-route/components/animations/FadeAnimation";
import UnmountAnimation from "../../../impower-route/components/animations/UnmountAnimation";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { panelChangeEditorState } from "../../types/actions/panelActions";
import { WindowType } from "../../types/state/windowState";

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

const StyledIconButton = styled(IconButton)`
  pointer-events: auto;
  color: inherit;
  margin: ${(props): string => props.theme.spacing(0.5)};
  padding: 0;
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

interface UndoRedoControlProps {
  type: WindowType;
}

const UndoRedoControl = React.memo(
  (props: UndoRedoControlProps): JSX.Element | null => {
    const { type } = props;
    const [state, dispatch] = useContext(ProjectEngineContext);
    const history =
      state?.panel?.panels?.[type]?.Container?.editorState?.history;
    const canUndo = history?.done?.length > 1;
    const canRedo = history?.undone?.length > 0;
    const handleUndo = useCallback(() => {
      dispatch(panelChangeEditorState(type, { action: "undo" }));
    }, [dispatch, type]);
    const handleRedo = useCallback(() => {
      dispatch(panelChangeEditorState(type, { action: "redo" }));
    }, [dispatch, type]);

    const theme = useTheme();

    if (canUndo || canRedo) {
      return (
        <UnmountAnimation>
          <StyledUndoRedoArea initial={0} animate={1} exit={0} duration={0.3}>
            <StyledLeftButtonBackground>
              <StyledIconButton
                onClick={handleUndo}
                style={{
                  pointerEvents: canUndo ? "auto" : "none",
                  color: canUndo
                    ? theme.palette.secondary.main
                    : theme.colors.white10,
                }}
              >
                <FontIcon aria-label="Redo" size={18}>
                  <RotateLeftRegularIcon />
                </FontIcon>
              </StyledIconButton>
            </StyledLeftButtonBackground>
            <StyledRightButtonBackground>
              <StyledIconButton
                onClick={handleRedo}
                style={{
                  pointerEvents: canRedo ? "auto" : "none",
                  color: canRedo
                    ? theme.palette.secondary.main
                    : theme.colors.white10,
                }}
              >
                <FontIcon aria-label="Undo" size={18}>
                  <RotateRightRegularIcon />
                </FontIcon>
              </StyledIconButton>
            </StyledRightButtonBackground>
          </StyledUndoRedoArea>
        </UnmountAnimation>
      );
    }
    return null;
  }
);

export default UndoRedoControl;
