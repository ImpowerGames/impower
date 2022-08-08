import styled from "@emotion/styled";
import IconButton from "@material-ui/core/IconButton";
import dynamic from "next/dynamic";
import React, { useCallback, useContext, useMemo, useState } from "react";
import EllipsisVerticalRegularIcon from "../../../resources/icons/regular/ellipsis-vertical.svg";
import FlagRegularIcon from "../../../resources/icons/regular/flag.svg";
import { escapeURI, getDataStoreKey } from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";
import { UserContext, userDoFollow, userUndoFollow } from "../../impower-user";

const PostMenu = dynamic(
  () => import("../../impower-route/components/popups/PostMenu"),
  { ssr: false }
);

const StyledIconButton = styled(IconButton)`
  margin-bottom: ${(props): string => props.theme.spacing(-0.5)};
  @media (hover: hover) and (pointer: fine) {
    &.MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }
`;

interface KudoCardActionProps {
  pitchId: string;
  contributionId: string;
  id: string;
  content?: string;
}

const KudoCardAction = React.memo((props: KudoCardActionProps): JSX.Element => {
  const { pitchId, contributionId, id, content } = props;

  const [userState, userDispatch] = useContext(UserContext);
  const { uid, my_follows, isSignedIn } = userState;
  const followedUser =
    my_follows !== undefined && id !== undefined
      ? Boolean(my_follows?.[getDataStoreKey("users", id)])
      : undefined;

  const [postMenuOpen, setPostMenuOpen] = useState<boolean>();
  const [postMenuAnchor, setPostMenuAnchor] = useState<HTMLElement>();

  const url =
    pitchId && contributionId && id
      ? `/p/${pitchId}/c/${contributionId}/n/${id}`
      : pitchId && id
      ? `/p/${pitchId}/n/${id}`
      : undefined;

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.m !== prevState?.m) {
        setPostMenuOpen(currState?.m === id);
      }
    },
    [id]
  );
  const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
    "m",
    handleBrowserNavigation
  );

  const handleBlockRipplePropogation = useCallback(
    (e: React.MouseEvent | React.TouchEvent): void => {
      e.stopPropagation();
    },
    []
  );

  const handleOpenPostMenu = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      e.preventDefault();
      e.stopPropagation();
      setPostMenuAnchor(e.currentTarget as HTMLElement);
      setPostMenuOpen(true);
      openMenuDialog(id);
    },
    [openMenuDialog, id]
  );

  const handleClosePostMenu = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      e.preventDefault();
      e.stopPropagation();
      setPostMenuOpen(false);
      closeMenuDialog();
    },
    [closeMenuDialog]
  );

  const [openAccountDialog] = useDialogNavigation("a");

  const handleFollowUser = useCallback(
    async (e: React.MouseEvent, followed: boolean): Promise<void> => {
      if (!isSignedIn) {
        openAccountDialog("signup");
        return;
      }
      if (followed) {
        userDispatch(userDoFollow("users", id));
      } else {
        userDispatch(userUndoFollow("users", id));
      }
    },
    [id, isSignedIn, openAccountDialog, userDispatch]
  );

  const handleReport = useCallback(async (): Promise<void> => {
    if (!isSignedIn) {
      openAccountDialog("signup");
      return;
    }
    const router = (await import("next/router")).default;
    // wait a bit for post dialog to close
    await new Promise((resolve) => {
      window.setTimeout(resolve, 1);
    });
    router.push(`/report?url=${escapeURI(url)}`);
  }, [isSignedIn, openAccountDialog, url]);

  const handlePostMenuOption = useCallback(
    async (e: React.MouseEvent, option: string): Promise<void> => {
      e.preventDefault();
      e.stopPropagation();
      handleClosePostMenu(e);
      await new Promise((resolve) => {
        // Wait for option dialog to close
        window.setTimeout(resolve, 1);
      });
      if (option === "FollowUser") {
        handleFollowUser(e, !followedUser);
      }
      if (option === "Report") {
        handleReport();
      }
    },
    [followedUser, handleClosePostMenu, handleFollowUser, handleReport]
  );

  const postNotCreatorOptions = useMemo(
    (): {
      [option: string]: {
        label: string;
        icon: React.ReactNode;
      };
    } => ({
      ...(url && content
        ? {
            Report: {
              label: "Report",
              icon: <FlagRegularIcon />,
            },
          }
        : {}),
    }),
    [content, url]
  );

  const options = useMemo(
    (): {
      [option: string]: {
        label: string;
        icon: React.ReactNode;
      };
    } => (id === uid ? {} : { ...postNotCreatorOptions }),
    [id, postNotCreatorOptions, uid]
  );

  const iconStyle: React.CSSProperties = useMemo(() => ({ opacity: 0.6 }), []);

  return (
    <>
      {options && Object.keys(options).length > 0 && (
        <StyledIconButton
          color="inherit"
          aria-label="Options"
          onClick={handleOpenPostMenu}
          onMouseDown={handleBlockRipplePropogation}
          onTouchStart={handleBlockRipplePropogation}
        >
          <FontIcon aria-label="Options" size={20} style={iconStyle}>
            <EllipsisVerticalRegularIcon />
          </FontIcon>
        </StyledIconButton>
      )}
      {postMenuOpen !== undefined && (
        <PostMenu
          anchorEl={postMenuAnchor}
          open={postMenuOpen}
          options={options}
          onClose={handleClosePostMenu}
          onOption={handlePostMenuOption}
        />
      )}
    </>
  );
});

export default KudoCardAction;
