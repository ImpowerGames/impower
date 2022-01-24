import dynamic from "next/dynamic";
import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  ContributionDocument,
  escapeURI,
  getDataStoreKey,
  ProjectDocument,
} from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { NavigationContext } from "../../impower-navigation";
import navigationSetTransitioning from "../../impower-navigation/utils/navigationSetTransitioning";
import {
  UserContext,
  userDoConnect,
  userDoDislike,
  userDoFollow,
  userDoLike,
  userOnUpdateSubmission,
  userUndoConnect,
  userUndoDislike,
  userUndoFollow,
  userUndoLike,
} from "../../impower-user";
import userAcceptConnect from "../../impower-user/utils/userAcceptConnect";
import getContributionPostOptionLabels from "../utils/getContributionPostOptionLabels";
import ContributionCardLayout from "./ContributionCardLayout";

const PostMenu = dynamic(
  () => import("../../impower-route/components/popups/PostMenu"),
  { ssr: false }
);

interface ContributionCardProps {
  cardRef?: React.Ref<HTMLDivElement>;
  avatarUserRef?: React.Ref<HTMLDivElement>;
  avatarBackRef?: React.Ref<HTMLDivElement>;
  truncationAreaRef?: React.Ref<HTMLDivElement>;
  truncationContentRef?: React.Ref<HTMLDivElement>;
  headerRef?: React.Ref<HTMLDivElement>;
  headerSentinelRef?: React.Ref<HTMLDivElement>;
  footerRef?: React.Ref<HTMLDivElement>;
  footerCoverRef?: React.Ref<HTMLDivElement>;
  buttonRef?: React.Ref<HTMLButtonElement>;
  closedActionsRef?: React.Ref<HTMLDivElement>;
  openedActionsRef?: React.Ref<HTMLDivElement>;
  contentRef?: React.Ref<HTMLDivElement>;
  pitchId?: string;
  pitchDoc?: ProjectDocument;
  id?: string;
  doc?: ContributionDocument;
  showBackButton?: boolean;
  preview?: boolean;
  hideFooterCover?: boolean;
  style?: React.CSSProperties;
  buttonContentStyle?: React.CSSProperties;
  openedActionsStyle?: React.CSSProperties;
  closedActionsStyle?: React.CSSProperties;
  onConnect?: (e: React.MouseEvent, connected: boolean) => void;
  onLike?: (e: React.MouseEvent, liked: boolean) => void;
  onDislike?: (e: React.MouseEvent, disliked: boolean) => void;
  onChangeScore?: (e: React.MouseEvent, score: number) => void;
  onOpen?: (e: React.MouseEvent) => void;
  onClose?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
}

const ContributionCard = React.memo(
  (props: ContributionCardProps): JSX.Element => {
    const {
      cardRef,
      avatarUserRef,
      avatarBackRef,
      truncationAreaRef,
      truncationContentRef,
      headerRef,
      headerSentinelRef,
      footerRef,
      footerCoverRef,
      buttonRef,
      closedActionsRef,
      openedActionsRef,
      contentRef,
      pitchId,
      pitchDoc,
      id,
      doc,
      showBackButton,
      preview,
      hideFooterCover,
      style,
      buttonContentStyle,
      openedActionsStyle,
      closedActionsStyle,
      onConnect,
      onLike,
      onDislike,
      onChangeScore,
      onOpen,
      onClose,
      onEdit,
      onDelete,
    } = props;

    const pitchUrl = `/p/${pitchId}`;
    const url = `${pitchUrl}/c/${id}`;
    const postMenuQueryKey = id;

    const createdBy = doc?._createdBy;
    const delisted = doc?.delisted;

    const [, navigationDispatch] = useContext(NavigationContext);
    const [userState, userDispatch] = useContext(UserContext);
    const {
      uid,
      my_likes,
      my_dislikes,
      connects,
      my_connects,
      my_follows,
      isSignedIn,
    } = userState;
    const isCreator = createdBy === uid;
    const liked =
      my_likes !== undefined
        ? Boolean(
            my_likes?.[
              getDataStoreKey("pitched_projects", pitchId, "contributions", id)
            ]
          )
        : undefined;
    const disliked =
      my_dislikes !== undefined
        ? Boolean(
            my_dislikes?.[
              getDataStoreKey("pitched_projects", pitchId, "contributions", id)
            ]
          )
        : undefined;
    const connectedTo =
      my_connects !== undefined && doc?._createdBy
        ? Boolean(my_connects?.[getDataStoreKey("users", doc?._createdBy)])
        : undefined;
    const connectedFrom =
      connects !== undefined && doc?._createdBy
        ? Boolean(connects?.[doc?._createdBy])
        : undefined;
    const followedUser =
      my_follows !== undefined
        ? Boolean(my_follows?.[getDataStoreKey("users", createdBy)])
        : undefined;

    const [postMenuOpen, setPostMenuOpen] = useState<boolean>();
    const [postMenuAnchor, setPostMenuAnchor] = useState<HTMLElement>();
    const [postOptions, setPostOptions] = useState<{
      [option: string]: {
        label?: string;
        icon?: React.ReactNode;
      };
    }>({});

    const handleLike = useCallback(
      async (e: React.MouseEvent, liked: boolean): Promise<void> => {
        if (liked) {
          userDispatch(
            userDoLike("pitched_projects", pitchId, "contributions", id)
          );
        } else {
          userDispatch(
            userUndoLike("pitched_projects", pitchId, "contributions", id)
          );
        }
        if (onLike) {
          onLike(e, liked);
        }
      },
      [onLike, userDispatch, id, pitchId]
    );

    const handleDislike = useCallback(
      async (e: React.MouseEvent, disliked: boolean): Promise<void> => {
        if (disliked) {
          userDispatch(
            userDoDislike("pitched_projects", pitchId, "contributions", id)
          );
        } else {
          userDispatch(
            userUndoDislike("pitched_projects", pitchId, "contributions", id)
          );
        }
        if (onDislike) {
          onDislike(e, disliked);
        }
      },
      [pitchId, id, onDislike, userDispatch]
    );

    const handleConnect = useCallback(
      async (e: React.MouseEvent, connected: boolean): Promise<void> => {
        if (connected) {
          if (connectedFrom) {
            userDispatch(userAcceptConnect("users", doc?._createdBy));
          } else {
            userDispatch(userDoConnect("users", doc?._createdBy));
          }
        } else {
          userDispatch(userUndoConnect("users", doc?._createdBy));
        }
        if (onConnect) {
          onConnect(e, connected);
        }
      },
      [connectedFrom, doc?._createdBy, onConnect, userDispatch]
    );

    const handleDelete = useCallback(
      async (e: React.MouseEvent): Promise<void> => {
        await new Promise<void>((resolve) =>
          userDispatch(
            userOnUpdateSubmission(
              resolve,
              {
                ...doc,
                deleted: true,
                delisted: true,
              },
              "pitched_projects",
              pitchId,
              "contributions",
              id
            )
          )
        );
        if (onDelete) {
          onDelete(e);
        }
      },
      [doc, id, onDelete, pitchId, userDispatch]
    );

    const handleSetupAndOpenPostMenu = useCallback(async () => {
      const getContributionPostOptionIcons = (
        await import("../utils/getContributionPostOptionIcons")
      ).default;
      const optionIcons = getContributionPostOptionIcons({
        delisted,
        isCreator,
        followedUser,
      });
      const options = {};
      Object.entries(
        getContributionPostOptionLabels({
          delisted,
          isCreator,
          followedUser,
        })
      ).forEach(([key, label]) => {
        const Icon = optionIcons[key];
        options[key] = { label, icon: <Icon /> };
      });
      setPostOptions(options);
      setPostMenuOpen(true);
    }, [delisted, followedUser, isCreator]);

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.m !== prevState?.m) {
          setPostMenuOpen(currState.m === postMenuQueryKey);
        }
      },
      [postMenuQueryKey]
    );
    const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
      "m",
      handleBrowserNavigation
    );

    const handleOpenPostMenu = useCallback(
      (e: React.MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        setPostMenuAnchor(e.currentTarget as HTMLElement);
        handleSetupAndOpenPostMenu();
        openMenuDialog(postMenuQueryKey);
      },
      [openMenuDialog, handleSetupAndOpenPostMenu, postMenuQueryKey]
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
          userDispatch(userDoFollow("users", createdBy));
        } else {
          userDispatch(userUndoFollow("users", createdBy));
        }
      },
      [createdBy, isSignedIn, openAccountDialog, userDispatch]
    );

    const handleReport = useCallback(async (): Promise<void> => {
      if (!isSignedIn) {
        openAccountDialog("signup");
        return;
      }
      // wait a bit for post dialog to close
      await new Promise((resolve) => window.setTimeout(resolve, 1));
      navigationDispatch(navigationSetTransitioning(true));
      const router = (await import("next/router")).default;
      router.push(`/report?url=${escapeURI(url)}`);
    }, [isSignedIn, navigationDispatch, openAccountDialog, url]);

    const handleOpenPitchPage = useCallback(async (): Promise<void> => {
      // wait a bit for post dialog to close
      await new Promise((resolve) => window.setTimeout(resolve, 1));
      const router = (await import("next/router")).default;
      navigationDispatch(navigationSetTransitioning(true));
      await router.push(`/p/${pitchId}`);
    }, [navigationDispatch, pitchId]);

    const handlePostMenuOption = useCallback(
      async (e: React.MouseEvent, option: string): Promise<void> => {
        e.preventDefault();
        e.stopPropagation();
        handleClosePostMenu(e);
        await new Promise((resolve) => {
          // Wait for option dialog to close
          window.setTimeout(resolve, 1);
        });
        const absoluteUrl = window.origin + url;
        if (option === "Edit") {
          if (onEdit) {
            onEdit(e);
          }
        }
        if (option === "Delete") {
          handleDelete(e);
        }
        if (option === "Link") {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(absoluteUrl);
          }
        }
        if (option === "Via") {
          try {
            if (navigator.share) {
              await navigator.share({
                title: `Impower Game Contribution`,
                url: absoluteUrl,
              });
            }
          } catch {
            // Share was canceled
          }
        }
        if (option === "FollowUser") {
          handleFollowUser(e, !followedUser);
        }
        if (option === "Report") {
          handleReport();
        }
        if (option === "OpenPitch") {
          handleOpenPitchPage();
        }
      },
      [
        followedUser,
        handleClosePostMenu,
        handleDelete,
        handleFollowUser,
        handleOpenPitchPage,
        handleReport,
        onEdit,
        url,
      ]
    );

    const createdAt =
      typeof doc?._createdAt === "string"
        ? doc?._createdAt
        : doc?._createdAt?.toDate()?.toJSON();
    const updatedAt =
      typeof doc?._updatedAt === "string"
        ? doc?._updatedAt
        : doc?._updatedAt?.toDate()?.toJSON();

    const removed = doc?.removed || doc?.banned;
    const removedPlaceholder = `[removed]`;
    const flaggedPlaceholder = `[flagged]`;
    const removedFile = useMemo(() => ({ storageKey: "", fileUrl: "" }), []);

    return (
      <>
        <ContributionCardLayout
          cardRef={cardRef}
          avatarUserRef={avatarUserRef}
          avatarBackRef={avatarBackRef}
          truncationAreaRef={truncationAreaRef}
          truncationContentRef={truncationContentRef}
          headerRef={headerRef}
          headerSentinelRef={headerSentinelRef}
          footerRef={footerRef}
          footerCoverRef={footerCoverRef}
          buttonRef={buttonRef}
          closedActionsRef={closedActionsRef}
          openedActionsRef={openedActionsRef}
          contentRef={contentRef}
          preview={preview}
          pitchId={pitchId}
          pitchDoc={pitchDoc}
          author={doc?._author}
          createdBy={doc?._createdBy}
          targetCreatedBy={pitchDoc?._createdBy}
          contributionType={doc?.contributionType}
          content={
            removed
              ? removedPlaceholder
              : doc?.flagged?.includes("content")
              ? flaggedPlaceholder
              : doc?.content
          }
          file={
            removed
              ? removedFile
              : doc?.flagged?.includes("file")
              ? null
              : doc?.file
          }
          waveform={doc?.waveform}
          aspectRatio={doc?.aspectRatio}
          square={doc?.square}
          crop={doc?.crop}
          tags={doc?.tags}
          delisted={doc?.delisted}
          createdAt={createdAt}
          updatedAt={updatedAt}
          score={doc?.score}
          nsfw={doc?.nsfw}
          connectedTo={connectedTo}
          connectedFrom={connectedFrom}
          liked={liked}
          disliked={disliked}
          followedUser={followedUser}
          onConnect={handleConnect}
          onLike={handleLike}
          onDislike={handleDislike}
          onChangeScore={onChangeScore}
          onOpen={onOpen}
          onClose={onClose}
          onOpenPostMenu={handleOpenPostMenu}
          showBackButton={showBackButton}
          hideFooterCover={hideFooterCover}
          style={style}
          buttonContentStyle={buttonContentStyle}
          openedActionsStyle={openedActionsStyle}
          closedActionsStyle={closedActionsStyle}
        />
        {postMenuQueryKey !== undefined && (
          <PostMenu
            anchorEl={postMenuAnchor}
            open={postMenuOpen}
            options={postOptions}
            onClose={handleClosePostMenu}
            onOption={handlePostMenuOption}
          />
        )}
      </>
    );
  }
);

export default ContributionCard;
