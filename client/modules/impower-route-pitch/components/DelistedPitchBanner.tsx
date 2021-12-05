import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  confirmDialogClose,
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../impower-confirm-dialog";
import { getDataStoreKey, ProjectDocument } from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { UserContext } from "../../impower-user";

const viewArchiveConfirmationInfo = {
  title: "View Archived Version?",
  content: "As the creator, you may view an archived version of this pitch.",
  agreeLabel: "View Archived",
  disagreeLabel: "Cancel",
};

const StyledDelistedWarningButton = styled(Button)`
  background-color: ${(props): string => props.theme.palette.error.main};
  color: white;
  padding: ${(props): string => props.theme.spacing(2, 2)};
  border-radius: 0;
  text-transform: none;

  &.MuiButton-root:hover {
    background-color: ${(props): string => props.theme.palette.error.main};
  }

  &.MuiButton-root.Mui-disabled {
    color: white;
  }

  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledWarningTypography = styled(Typography)`
  text-align: center;
`;

const StyledBoldWarningTypography = styled(StyledWarningTypography)`
  font-weight: bold;
`;

interface DelistedPitchBannerProps {
  archived?: boolean;
  id: string;
  onChange?: (value: ProjectDocument) => void;
}

const DelistedPitchBanner = React.memo(
  (props: DelistedPitchBannerProps): JSX.Element => {
    const { archived, id, onChange } = props;

    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
    const [userState] = useContext(UserContext);
    const { uid, my_recent_pitched_projects } = userState;

    const [isCreator, setIsCreator] = useState<boolean>();

    useEffect(() => {
      if (uid === undefined) {
        return;
      }
      if (!uid) {
        setIsCreator(false);
        return;
      }
      if (my_recent_pitched_projects?.[id]) {
        setIsCreator(true);
      } else {
        const checkIsCreator = async (): Promise<void> => {
          const DataStateRead = (
            await import("../../impower-data-state/classes/dataStateRead")
          ).default;
          const submissionKey = ["pitched_projects", id].join("%");
          const ref = new DataStateRead(
            "users",
            uid,
            "agg",
            "my_submissions",
            "data",
            submissionKey
          );
          const snapshot = await ref.get();
          setIsCreator(Boolean(snapshot.val()));
        };
        checkIsCreator();
      }
    }, [id, my_recent_pitched_projects, uid]);

    const [, closeAppDialog] = useDialogNavigation("a");

    const handleOpenArchivedConfirmDialog = useCallback((): void => {
      const onYes = async (): Promise<void> => {
        const submissionKey = getDataStoreKey("pitched_projects", id);
        const DataStoreRead = (
          await import("../../impower-data-store/classes/dataStoreRead")
        ).default;
        const snapshot = await new DataStoreRead(
          "users",
          uid,
          "deleted_submissions",
          submissionKey
        ).get<ProjectDocument>();
        const archivedDoc = snapshot.data();
        if (onChange) {
          onChange(archivedDoc);
        }
        confirmDialogDispatch(confirmDialogClose());
        closeAppDialog();
      };
      confirmDialogDispatch(
        confirmDialogNavOpen(
          viewArchiveConfirmationInfo.title,
          viewArchiveConfirmationInfo.content,
          viewArchiveConfirmationInfo.agreeLabel,
          onYes,
          viewArchiveConfirmationInfo.disagreeLabel,
          undefined,
          { asynchronous: true }
        )
      );
    }, [confirmDialogDispatch, closeAppDialog, id, onChange, uid]);

    return (
      <StyledDelistedWarningButton
        disabled={archived || !isCreator}
        fullWidth
        onClick={handleOpenArchivedConfirmDialog}
      >
        <StyledBoldWarningTypography>
          {archived
            ? `This is an archived version of the pitch.`
            : `This pitch has been deleted.`}
        </StyledBoldWarningTypography>
        <StyledWarningTypography variant="caption">
          {archived
            ? `It cannot be viewed by others`
            : `Its original contents are only accessible to the creator`}
        </StyledWarningTypography>
      </StyledDelistedWarningButton>
    );
  }
);

export default DelistedPitchBanner;
