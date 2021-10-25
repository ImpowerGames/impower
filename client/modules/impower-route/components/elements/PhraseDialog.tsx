import styled from "@emotion/styled";
import { Grow } from "@material-ui/core";
import Dialog, { DialogProps } from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import React from "react";

const StyledPhraseDialog = styled(Dialog)`
  * {
    touch-action: none;
    overscroll-behavior: contain;
  }

  & .MuiDialog-container.MuiDialog-scrollPaper * {
    touch-action: pan-y;
    overscroll-behavior: contain;
  }

  & .MuiDialog-container.MuiDialog-scrollPaper {
    will-change: transform;
    transform: translateZ(0);
    touch-action: pan-y;
    overscroll-behavior: contain;
    width: 100%;
  }
`;

const StyledDialogTitle = styled(DialogTitle)`
  padding-top: ${(props): string => props.theme.spacing(3)};
  text-align: center;
`;

const StyledDialogContent = styled(DialogContent)`
  padding-top: 0;
  padding-bottom: 0;
  display: flex;
  flex-direction: column;
`;

const StyledDialogActions = styled(DialogActions)`
  padding-top: ${(props): string => props.theme.spacing(2)};
  padding-bottom: ${(props): string => props.theme.spacing(3)};
  padding-left: ${(props): string => props.theme.spacing(3)};
  padding-right: ${(props): string => props.theme.spacing(3)};
`;

interface PhraseDialogProps extends Omit<DialogProps, "title"> {
  open: boolean;
  title?: React.ReactNode;
  content?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
}

const PhraseDialog = React.memo((props: PhraseDialogProps) => {
  const { open, title, content, actions, onClose, ...other } = props;

  return (
    <StyledPhraseDialog
      TransitionComponent={Grow}
      open={open}
      onClose={onClose}
      maxWidth="sm"
      {...other}
    >
      <StyledDialogTitle>{title}</StyledDialogTitle>
      <StyledDialogContent>{content}</StyledDialogContent>
      <StyledDialogActions>{actions}</StyledDialogActions>
    </StyledPhraseDialog>
  );
});

export default PhraseDialog;
