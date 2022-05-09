import * as React from "react";
import {
  Button,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  DialogTitle,
  Dialog,
  Typography,
} from "@material-ui/core";

const emails = ["username@gmail.com", "user02@gmail.com"];

interface FlaggedContentDialogProps {
  onClose: () => void;
  open: boolean;
}

const FlaggedContentDialog = React.memo(
  (props: FlaggedContentDialogProps): JSX.Element | null => {
    const { onClose, open } = props;

    const handleClose = (): void => {
      onClose();
    };

    return (
      <Dialog onClose={handleClose} open={open}>
        <DialogTitle>Set backup account</DialogTitle>
        <List sx={{ pt: 0 }}>
          {emails.map((email) => (
            <ListItem button key={email}>
              <ListItemAvatar>
                <Avatar></Avatar>
              </ListItemAvatar>
              <ListItemText primary={email} />
            </ListItem>
          ))}
        </List>
      </Dialog>
    );
  }
);

export default FlaggedContentDialog;
