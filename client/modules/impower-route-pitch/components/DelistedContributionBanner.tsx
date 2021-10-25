import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  confirmDialogClose,
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../impower-confirm-dialog";
import {
  ContributionDocument,
  getDataStoreKey,
} from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { UserContext } from "../../impower-user";

const viewArchiveConfirmationInfo = {
  title: "View Archived Version?",
  content:
    "As the creator, you may view an archived version of this contribution.",
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

interface DelistedContributionBannerProps {
  archived?: boolean;
  pitchId?: string;
  id?: string;
  removed?: boolean;
  onChange?: (value: ContributionDocument) => void;
}

const DelistedContributionBanner = React.memo(
  (props: DelistedContributionBannerProps): JSX.Element => {
    const pitchedCollection = "pitched_games";

    const { archived, pitchId, id, removed, onChange } = props;

    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
    const [userState] = useContext(UserContext);
    const { uid, my_recent_contributions } = userState;

    const [isCreator, setIsCreator] = useState<boolean>();

    useEffect(() => {
      if (my_recent_contributions?.[pitchId]?.[id]) {
        setIsCreator(true);
      } else {
        const checkIsCreator = async (): Promise<void> => {
          const DataStateRead = (
            await import("../../impower-data-state/classes/dataStateRead")
          ).default;
          const submissionKey = [
            pitchedCollection,
            pitchId,
            "contributions",
            id,
          ].join("%");
          const ref = new DataStateRead(
            "users",
            uid,
            "deleted_submissions",
            submissionKey
          );
          const snapshot = await ref.get();
          setIsCreator(Boolean(snapshot.val()));
        };
        checkIsCreator();
      }
    }, [id, my_recent_contributions, pitchId, uid]);

    const [, closeAppDialog] = useDialogNavigation("a");

    const handleOpenArchivedConfirmDialog = useCallback((): void => {
      const onYes = async (): Promise<void> => {
        const submissionKey = getDataStoreKey(
          pitchedCollection,
          pitchId,
          "contributions",
          id
        );
        const DataStoreRead = (
          await import("../../impower-data-store/classes/dataStoreRead")
        ).default;
        const snapshot = await new DataStoreRead(
          "users",
          uid,
          "deleted_submissions",
          submissionKey
        ).get<ContributionDocument>();
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
    }, [confirmDialogDispatch, closeAppDialog, id, onChange, pitchId, uid]);

    return (
      <StyledDelistedWarningButton
        disabled={archived || !isCreator}
        fullWidth
        onClick={handleOpenArchivedConfirmDialog}
      >
        <StyledBoldWarningTypography>
          {removed
            ? archived
              ? `This is an archived version of the contribution before it was removed.`
              : `This contribution has been removed by a moderator.`
            : archived
            ? `This is an archived version of the contribution before it was deleted.`
            : `This contribution has been deleted.`}
        </StyledBoldWarningTypography>
        <StyledWarningTypography variant="caption">
          {removed
            ? archived
              ? `It is only visible to you and moderators`
              : `Its original contents are only accessible to moderators and the creator`
            : archived
            ? `It cannot be viewed by others`
            : `Its original contents are only accessible to the creator`}
        </StyledWarningTypography>
      </StyledDelistedWarningButton>
    );
  }
);

export default DelistedContributionBanner;
