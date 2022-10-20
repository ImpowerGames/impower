import styled from "@emotion/styled";
import Alert, { AlertColor } from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Slide from "@mui/material/Slide";
import Snackbar, { SnackbarOrigin } from "@mui/material/Snackbar";
import { TransitionProps } from "@mui/material/transitions";
import React from "react";
import XmarkSolidIcon from "../../../../resources/icons/solid/xmark.svg";
import { FontIcon } from "../../../impower-icon";

const StyledSnackbar = styled(Snackbar)`
  pointer-events: none;

  & .MuiSnackbarContent-action {
    margin-right: 0;
  }
`;

const StyledButton = styled(Button)`
  pointer-events: auto;
  min-width: 0;
`;

interface ToastProps {
  id: string;
  open: boolean;
  message: string;
  actionLabel?: React.ReactNode;
  autoHideDuration?: number;
  anchorOrigin?: SnackbarOrigin;
  severity?: AlertColor;
  direction?: "up" | "left" | "right" | "down";
  onAction?: () => void;
  onClose: () => void;
}

const Toast = React.memo((props: ToastProps): JSX.Element => {
  const {
    id,
    open,
    message,
    actionLabel,
    autoHideDuration = 4000,
    anchorOrigin = {
      vertical: "bottom",
      horizontal: "left",
    },
    direction = "right",
    severity,
    onAction,
    onClose,
  } = props;

  return (
    <StyledSnackbar
      key={`${id}${message}`}
      anchorOrigin={anchorOrigin}
      open={open}
      autoHideDuration={autoHideDuration < 0 ? undefined : autoHideDuration}
      TransitionComponent={
        direction
          ? React.forwardRef(
              (
                props: TransitionProps & { children: React.ReactElement },
                ref
              ): JSX.Element => (
                <Slide {...props} direction={direction} ref={ref} />
              )
            )
          : undefined
      }
      onClose={onClose}
      action={
        <StyledButton
          color={severity ? "secondary" : "inherit"}
          style={{ padding: 0 }}
          onClick={(): void => {
            if (onAction) {
              onAction();
            }
            if (onClose) {
              onClose();
            }
          }}
        >
          {actionLabel !== undefined ? (
            actionLabel
          ) : (
            <FontIcon aria-label="Close" size={24}>
              <XmarkSolidIcon />
            </FontIcon>
          )}
        </StyledButton>
      }
      message={severity === undefined ? message : undefined}
    >
      {severity && (
        <Alert onClose={onClose} severity={severity}>
          {message}
        </Alert>
      )}
    </StyledSnackbar>
  );
});

export default Toast;
