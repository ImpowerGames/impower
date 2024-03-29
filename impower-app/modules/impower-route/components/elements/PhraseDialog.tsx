import styled from "@emotion/styled";
import Dialog, { DialogProps } from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grow from "@mui/material/Grow";
import Typography from "@mui/material/Typography";
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

const StyledDialogTitleArea = styled.div`
  padding: ${(props): string => props.theme.spacing(3, 3, 2, 3)};
  text-align: center;
`;

const StyledDialogTitle = styled(DialogTitle)`
  padding: 0;
  text-align: center;
`;

const StyledDialogSubtitle = styled(Typography)`
  text-align: center;
  font-weight: 600;
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
  subtitle?: React.ReactNode;
  content?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
}

const PhraseDialog = React.memo((props: PhraseDialogProps) => {
  const { open, title, subtitle, content, actions, onClose, ...other } = props;

  return (
    <StyledPhraseDialog
      TransitionComponent={Grow}
      open={open}
      onClose={onClose}
      maxWidth="sm"
      {...other}
    >
      <StyledDialogTitleArea>
        <StyledDialogTitle>{title}</StyledDialogTitle>
        {subtitle && (
          <StyledDialogSubtitle variant="caption" color="textSecondary">
            {subtitle}
          </StyledDialogSubtitle>
        )}
      </StyledDialogTitleArea>
      <StyledDialogContent>{content}</StyledDialogContent>
      <StyledDialogActions>{actions}</StyledDialogActions>
    </StyledPhraseDialog>
  );
});

export default PhraseDialog;
