import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogProps,
  DialogTitle,
  Grow,
  Typography,
} from "@material-ui/core";
import Button from "@material-ui/core/Button";
import { Variant } from "@material-ui/core/styles/createTypography";
import { TransitionProps } from "@material-ui/core/transitions";
import React, { PropsWithChildren, useCallback, useState } from "react";
import Markdown from "../elements/Markdown";
import DynamicLoadingButton from "../inputs/DynamicLoadingButton";

const StyledConfirmDialog = styled(Dialog)<{ responsive?: string }>`
  will-change: transform;

  & .MuiPaper-root {
    overflow-x: hidden;
    max-width: ${(props): string => (props.responsive ? `496px` : "none")};
    padding: ${(props): string => props.theme.spacing(1)};

    ${(props): string => props.theme.breakpoints.down("sm")} {
      ${(props): string => (props.responsive ? `height: 100%;` : "")}
      ${(props): string =>
        props.responsive ? `margin: 0;` : `margin: ${props.theme.spacing(2)}`}
      ${(props): string => (props.responsive ? `border-radius: 0;` : "")}
      ${(props): string => (props.responsive ? `width: 100%;` : "")}
      ${(props): string => (props.responsive ? `max-width: 100%;` : "")}
      ${(props): string => (props.responsive ? `max-height: 100%;` : "")}
    }
  }
`;

const StyledTitleTypography = styled(Typography)`
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledDialogContent = styled(DialogContent)<{ component?: string }>`
  display: flex;
  flex-direction: column;
  align-items: inherit;
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
`;

const StyledContentText = styled(DialogContentText)<{ component?: string }>`
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
`;

const StyledDialogActions = styled(DialogActions)<{ component?: string }>`
  width: 100%;
`;

const StyledNoButton = styled(Button)`
  position: relative;
  padding: ${(props): string => props.theme.spacing(1, 2, 1, 1)};
`;

const StyledYesButton = styled(DynamicLoadingButton)`
  position: relative;
`;

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children?: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Grow ref={ref} {...props} />;
});

interface ConfirmDialogProps extends DialogProps {
  open: boolean;
  title?: string;
  content?: string;
  disagreeLabel?: string;
  agreeLabel?: string;
  disableAutoFocus?: boolean;
  disableEnforceFocus?: boolean;
  disableRestoreFocus?: boolean;
  style?: React.CSSProperties;
  titleVariant?: Variant | "inherit";
  responsive?: boolean;
  asynchronous?: boolean;
  onClose?: () => void;
  onAgree?: () => void;
  onDisagree?: () => void;
}

export const ConfirmDialog = (
  props: PropsWithChildren<ConfirmDialogProps>
): JSX.Element => {
  const {
    open,
    title,
    content,
    disagreeLabel,
    agreeLabel,
    disableAutoFocus,
    disableEnforceFocus,
    disableRestoreFocus,
    asynchronous,
    children,
    titleVariant,
    responsive,
    TransitionProps,
    style,
    onClose = (): void => null,
    onAgree = (): void => null,
    onDisagree = (): void => null,
    ...provided
  } = props;
  const onExit = TransitionProps?.onExit;

  const [submitting, setSubmitting] = useState(false);

  const theme = useTheme();

  const handleExit = useCallback(
    (node: HTMLElement) => {
      setSubmitting(false);
      if (onExit) {
        onExit(node);
      }
    },
    [onExit]
  );

  const handleClose = useCallback(() => {
    if (submitting) {
      return;
    }
    if (onClose) {
      onClose();
    }
  }, [onClose, submitting]);

  return (
    <StyledConfirmDialog
      open={open}
      TransitionComponent={Transition}
      disableAutoFocus={disableAutoFocus}
      disableEnforceFocus={disableEnforceFocus}
      disableRestoreFocus={disableRestoreFocus}
      onClose={handleClose}
      TransitionProps={{ ...TransitionProps, onExit: handleExit }}
      aria-labelledby="alert-dialog-slide-title"
      aria-describedby="alert-dialog-slide-description"
      {...provided}
      responsive={responsive ? "true" : undefined}
      style={{
        zIndex: 10000,
        ...style,
      }}
    >
      {title && (
        <DialogTitle id="alert-dialog-slide-title">
          <StyledTitleTypography
            variant={titleVariant}
            className={StyledTitleTypography.displayName}
          >
            {title}
          </StyledTitleTypography>
        </DialogTitle>
      )}
      {content && (
        <StyledDialogContent>
          {children}
          <StyledContentText
            id="alert-dialog-slide-description"
            component="div"
            color="textPrimary"
          >
            <Markdown>{content}</Markdown>
          </StyledContentText>
        </StyledDialogContent>
      )}
      <StyledDialogActions>
        {disagreeLabel && (
          <StyledNoButton
            disabled={submitting}
            onClick={(): void => {
              if (onDisagree) {
                onDisagree();
              }
              handleClose();
            }}
            color="inherit"
          >
            {disagreeLabel}
          </StyledNoButton>
        )}
        {agreeLabel && (
          <StyledYesButton
            loading={submitting}
            onClick={async (): Promise<void> => {
              if (asynchronous) {
                setSubmitting(true);
              }
              if (!asynchronous) {
                handleClose();
              }
              await new Promise((resolve) => setTimeout(resolve, 1));
              if (onAgree) {
                onAgree();
              }
            }}
            color="primary"
            variant="contained"
            style={{
              fontWeight: theme.fontWeight.bold,
            }}
          >
            {agreeLabel}
          </StyledYesButton>
        )}
      </StyledDialogActions>
    </StyledConfirmDialog>
  );
};

export default ConfirmDialog;
