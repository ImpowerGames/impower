import * as React from "react";
import styled from "@emotion/styled";
import { DialogTitle, Dialog } from "@material-ui/core";

const ifNsfw = "Your post was marked NSFW";
const ifRemoved = "Your post was removed";
const ifSomethingWentWrong = "Something went wrong";

const nsfwDescription =
  "Your post will still be visable to users who have enabled NSFW content.";
const removedDescription =
  "We detected spam, hateful, or otherwise innappropriate content.";
const generalSupport =
  "If you believe your post was catagorized in error, you can send us an email at support@impower.games";
const bugSupport =
  "We're not sure how you got this notification, if you'd like us to look into it you can send us an email at support@impower.games";

const StyledDescriptionTextArea = styled.div`
  flex: 1;
  flex-direction: column;
  padding: ${(props): string => props.theme.spacing(0, 4, 2, 4)};
  position: relative;
  min-height: 100px;
  align-items: start;
  justify-content: center;
  display: flex;
`;

const StyledDialogTitle = styled(DialogTitle)`
  text-align: center;
`;

interface FlaggedContentDialogProps {
  onClose: () => void;
  open: boolean;
  nsfw: boolean;
  removed: boolean;
}

const FlaggedContentDialog = React.memo(
  (props: FlaggedContentDialogProps): JSX.Element | null => {
    const { onClose, open, nsfw, removed } = props;

    const handleClose = (): void => {
      onClose();
    };

    return (
      <Dialog onClose={handleClose} open={open}>
        <StyledDialogTitle>
          {removed ? ifRemoved : nsfw ? ifNsfw : ifSomethingWentWrong}
        </StyledDialogTitle>
        <StyledDescriptionTextArea>
          <div>
            {removed ? (
              <>{removedDescription}</>
            ) : nsfw ? (
              <>{nsfwDescription}</>
            ) : (
              <></>
            )}
          </div>
          <div>{nsfw ? <>{generalSupport}</> : <>{bugSupport}</>}</div>
        </StyledDescriptionTextArea>
      </Dialog>
    );
  }
);

export default FlaggedContentDialog;
