import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Dialog from "@material-ui/core/Dialog";
import Grow from "@material-ui/core/Grow";
import IconButton from "@material-ui/core/IconButton";
import { TransitionProps } from "@material-ui/core/transitions";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import React, { useCallback, useMemo, useRef } from "react";
import XmarkSolidIcon from "../../../../resources/icons/solid/xmark.svg";
import { FontIcon } from "../../../impower-icon";
import Login from "../../../impower-route-login/components/Login";
import SignUp from "../../../impower-route-signup/components/SignUp";
import { setBodyBackgroundColor } from "../../utils/setBodyBackgroundColor";
import { setHTMLBackgroundColor } from "../../utils/setHTMLBackgroundColor";

const StyledAccountDialog = styled(Dialog)`
  will-change: transform;
  z-index: 3000;

  & .MuiDialog-container.MuiDialog-scrollPaper {
    align-items: center;
    justify-content: center;
    ${(props): string => props.theme.breakpoints.down("md")} {
      align-items: stretch;
      justify-content: stretch;
    }
  }

  & .MuiPaper-root.MuiDialog-paper {
    overflow-y: scroll;
    overflow-x: hidden;
    max-width: 480px;
    ${(props): string => props.theme.breakpoints.down("md")} {
      margin: ${(props): string => props.theme.spacing(0, 0)};
      border-radius: 0;
      width: 100%;
      max-width: 100%;
      max-height: 100%;
    }
  }
`;

const StyledHeader = styled.div`
  width: 100%;
  padding: ${(props): string => props.theme.spacing(2, 2)};
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  pointer-events: none;
  ${(props): string => props.theme.breakpoints.down("md")} {
    padding: ${(props): string => props.theme.spacing(1, 1)};
  }
`;

const StyledIconButton = styled(IconButton)`
  pointer-events: auto;
  display: flex;
  justify-content: flex-end;
  ${(props): string => props.theme.breakpoints.down("md")} {
    justify-content: flex-start;
  }
`;

const GrowTransition = React.forwardRef(function Transition(
  props: TransitionProps & { children?: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Grow ref={ref} {...props} />;
});

interface AccountDialogProps {
  open: boolean;
  type: "signup" | "login";
  onClose: () => void;
  onProcessing?: (processing: boolean) => void;
  onChangeType?: (type: "signup" | "login") => void;
}

const AccountDialog = React.memo((props: AccountDialogProps): JSX.Element => {
  const { open, type, onClose, onProcessing, onChangeType } = props;

  const bodyColor = useRef<string>();

  const theme = useTheme();

  const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));

  const handleEntered = useCallback((): void => {
    bodyColor.current = document.body.style.backgroundColor;
    if (belowSmBreakpoint) {
      setBodyBackgroundColor(document, "white");
      setHTMLBackgroundColor(document, "white");
    }
  }, [belowSmBreakpoint]);

  const handleExit = useCallback((): void => {
    setBodyBackgroundColor(document, bodyColor.current);
    setHTMLBackgroundColor(document, bodyColor.current);
  }, []);

  const handleOpenSignUp = useCallback((): void => {
    if (onChangeType) {
      onChangeType("signup");
    }
  }, [onChangeType]);

  const handleOpenLogin = useCallback((): void => {
    if (onChangeType) {
      onChangeType("login");
    }
  }, [onChangeType]);

  const PaperProps = useMemo(
    () => ({
      elevation: belowSmBreakpoint ? 0 : undefined,
    }),
    [belowSmBreakpoint]
  );

  return (
    <StyledAccountDialog
      maxWidth="sm"
      open={open}
      PaperProps={PaperProps}
      fullScreen={belowSmBreakpoint}
      onClose={onClose}
      TransitionComponent={GrowTransition}
      TransitionProps={{
        onEntered: handleEntered,
        onExit: handleExit,
      }}
    >
      {type === "signup" && (
        <SignUp onOpenLogin={handleOpenLogin} onProcessing={onProcessing} />
      )}
      {type === "login" && (
        <Login onOpenSignUp={handleOpenSignUp} onProcessing={onProcessing} />
      )}
      <StyledHeader>
        {onClose && (
          <StyledIconButton onClick={onClose}>
            <FontIcon
              aria-label="Back"
              color={theme.palette.primary.light}
              size={24}
            >
              <XmarkSolidIcon />
            </FontIcon>
          </StyledIconButton>
        )}
      </StyledHeader>
    </StyledAccountDialog>
  );
});

export default AccountDialog;
