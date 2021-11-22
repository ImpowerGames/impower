import dynamic from "next/dynamic";
import React, { useCallback, useContext, useState } from "react";
import { ConfigParameters } from "../../impower-config";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../impower-confirm-dialog";
import {
  escapeURI,
  getDataStoreKey,
  ProjectDocument,
} from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { SvgData } from "../../impower-icon";
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
import PitchCardLayout from "./PitchCardLayout";

const deleteConfirmationInfo = {
  title: "Are you sure you want to delete this pitch?",
  content:
    "The name & summary will be deleted, but the pitch's kudos and contributions will still be visible.\n\n*This action cannot be undone.*",
  agreeLabel: "Yes, Delete My Pitch",
  disagreeLabel: "Cancel",
};

export type ShareOption = "Link" | "Via";

const PostMenu = dynamic(
  () => import("../../impower-route/components/popups/PostMenu"),
  { ssr: false }
);

interface PitchCardProps {
  cardRef?: React.Ref<HTMLDivElement>;
  buttonRef?: React.Ref<HTMLButtonElement>;
  scrollbarSpacerRef?: React.Ref<HTMLDivElement>;
  titleRef?: React.Ref<HTMLDivElement>;
  openedActionsRef?: React.Ref<HTMLDivElement>;
  closedActionsRef?: React.Ref<HTMLDivElement>;
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  id?: string;
  doc?: ProjectDocument;
  preview?: boolean;
  style?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
  openedActionsStyle?: React.CSSProperties;
  closedActionsStyle?: React.CSSProperties;
  scrollbarSpacerStyle?: React.CSSProperties;
  onOpen?: (e: React.MouseEvent, action: "contribute" | "kudo") => void;
  onLike?: (e: React.MouseEvent, liked: boolean) => void;
  onDislike?: (e: React.MouseEvent, disliked: boolean) => void;
  onChangeScore?: (e: React.MouseEvent, score: number) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
}

const PitchCard = React.memo((props: PitchCardProps): JSX.Element => {
  const {
    cardRef,
    buttonRef,
    scrollbarSpacerRef,
    titleRef,
    openedActionsRef,
    closedActionsRef,
    config,
    icons,
    id,
    doc,
    preview,
    style,
    buttonStyle,
    scrollbarSpacerStyle,
    openedActionsStyle,
    closedActionsStyle,
    onOpen,
    onLike,
    onDislike,
    onChangeScore,
    onEdit,
    onDelete,
  } = props;

  const delisted = doc?.delisted || !doc?.pitched;
  const url = `/p/${id}`;
  const postMenuQueryKey = id;

  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [userState, userDispatch] = useContext(UserContext);
  const {
    uid,
    connects,
    my_submissions,
    my_connects,
    my_follows,
    my_likes,
    my_dislikes,
    my_kudos,
    my_recent_contributions,
  } = userState;
  const authenticated = uid !== undefined ? Boolean(uid) : undefined;
  const isCreator = doc?._createdBy === uid;
  const contributed =
    my_submissions !== undefined && id && uid
      ? Boolean(
          my_submissions?.[
            getDataStoreKey(
              "pitched_projects",
              id,
              "contributions",
              `${uid}-pitch`
            )
          ]
        ) ||
        Boolean(
          my_submissions?.[
            getDataStoreKey(
              "pitched_projects",
              id,
              "contributions",
              `${uid}-story`
            )
          ]
        ) ||
        Boolean(
          my_submissions?.[
            getDataStoreKey(
              "pitched_projects",
              id,
              "contributions",
              `${uid}-image`
            )
          ]
        ) ||
        Boolean(
          my_submissions?.[
            getDataStoreKey(
              "pitched_projects",
              id,
              "contributions",
              `${uid}-audio`
            )
          ]
        ) ||
        Boolean(my_recent_contributions?.[id]?.[`${uid}-pitch`]) ||
        Boolean(my_recent_contributions?.[id]?.[`${uid}-story`]) ||
        Boolean(my_recent_contributions?.[id]?.[`${uid}-image`]) ||
        Boolean(my_recent_contributions?.[id]?.[`${uid}-audio`])
      : undefined;
  const liked =
    my_likes !== undefined && id
      ? Boolean(my_likes?.[getDataStoreKey("pitched_projects", id)])
      : undefined;
  const disliked =
    my_dislikes !== undefined && id
      ? Boolean(my_dislikes?.[getDataStoreKey("pitched_projects", id)])
      : undefined;
  const kudoed =
    my_kudos !== undefined && id
      ? Boolean(my_kudos?.[getDataStoreKey("pitched_projects", id)])
      : undefined;
  const followedUser =
    my_follows !== undefined && doc?._createdBy
      ? Boolean(my_follows?.[getDataStoreKey("users", doc?._createdBy)])
      : undefined;
  const connectedTo =
    my_connects !== undefined && doc?._createdBy
      ? Boolean(my_connects?.[getDataStoreKey("users", doc?._createdBy)])
      : undefined;
  const connectedFrom =
    connects !== undefined && doc?._createdBy
      ? Boolean(connects?.[doc?._createdBy])
      : undefined;

  const [postMenuOpen, setPostMenuOpen] = useState<boolean>();
  const [postMenuAnchor, setPostMenuAnchor] = useState<HTMLElement>();
  const [postOptions, setPostOptions] = useState<{
    [option: string]: {
      label?: string;
      icon?: React.ReactNode;
    };
  }>({});
  const [openAccountDialog] = useDialogNavigation("a");

  const handleLike = useCallback(
    (e: React.MouseEvent, liked: boolean): void => {
      if (liked) {
        userDispatch(userDoLike("pitched_projects", id));
      } else {
        userDispatch(userUndoLike("pitched_projects", id));
      }
      if (onLike) {
        onLike(e, liked);
      }
    },
    [id, onLike, userDispatch]
  );

  const handleDislike = useCallback(
    (e: React.MouseEvent, disliked: boolean): void => {
      if (disliked) {
        userDispatch(userDoDislike("pitched_projects", id));
      } else {
        userDispatch(userUndoDislike("pitched_projects", id));
      }
      if (onDislike) {
        onDislike(e, disliked);
      }
    },
    [id, onDislike, userDispatch]
  );

  const handleEdit = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      if (onEdit) {
        onEdit(e);
      }
    },
    [onEdit]
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent): Promise<void> => {
      const onYes = async (): Promise<void> => {
        await new Promise<void>((resolve) =>
          userDispatch(
            userOnUpdateSubmission(
              resolve,
              {
                ...doc,
                pitched: false,
                delisted: true,
              },
              "projects",
              id
            )
          )
        );
        if (onDelete) {
          onDelete(e);
        }
      };
      confirmDialogDispatch(
        confirmDialogNavOpen(
          deleteConfirmationInfo.title,
          deleteConfirmationInfo.content,
          deleteConfirmationInfo.agreeLabel,
          onYes,
          deleteConfirmationInfo.disagreeLabel,
          undefined,
          { asynchronous: true, responsive: true }
        )
      );
    },
    [confirmDialogDispatch, onDelete, userDispatch, id, doc]
  );

  const handleSetupAndOpenPostMenu = useCallback(async () => {
    const getPitchPostOptions = (await import("../utils/getPitchPostOptions"))
      .default;
    const options = {};
    Object.entries(
      getPitchPostOptions({
        delisted,
        isCreator,
        followedUser,
      })
    ).forEach(([key, value]) => {
      const Icon = value.icon;
      options[key] = { ...value, icon: <Icon /> };
    });
    setPostOptions(options);
    setPostMenuOpen(true);
  }, [delisted, followedUser, isCreator]);

  const handleSetupAndOpenShareMenu = useCallback(async () => {
    const getPitchShareOptions = (await import("../utils/getPitchShareOptions"))
      .default;
    const options = {};
    Object.entries(getPitchShareOptions()).forEach(([key, value]) => {
      const Icon = value.icon;
      options[key] = { ...value, icon: <Icon /> };
    });
    setPostOptions(options);
    setPostMenuOpen(true);
  }, []);

  const handleConnect = useCallback(
    (e: React.MouseEvent, connected: boolean): void => {
      if (connected) {
        userDispatch(userDoConnect("users", doc?._createdBy));
      } else {
        userDispatch(userUndoConnect("users", doc?._createdBy));
      }
    },
    [doc?._createdBy, userDispatch]
  );

  const handleFollowUser = useCallback(
    (e: React.MouseEvent, followed: boolean): void => {
      e.stopPropagation();
      if (!authenticated) {
        openAccountDialog("signup");
        return;
      }
      if (followed) {
        userDispatch(userDoFollow("users", doc?._createdBy));
      } else {
        userDispatch(userUndoFollow("users", doc?._createdBy));
      }
    },
    [authenticated, openAccountDialog, userDispatch, doc?._createdBy]
  );

  const handleReport = useCallback(async (): Promise<void> => {
    if (!authenticated) {
      openAccountDialog("signup");
      return;
    }
    const router = (await import("next/router")).default;
    // wait a bit for post dialog to close
    await new Promise((resolve) => window.setTimeout(resolve, 1));
    router.push(`/report?url=${escapeURI(url)}`);
  }, [authenticated, openAccountDialog, url]);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
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
      const el = e.currentTarget as HTMLElement;
      setPostMenuAnchor(el);
      handleSetupAndOpenPostMenu();
      openMenuDialog(postMenuQueryKey);
    },
    [handleSetupAndOpenPostMenu, openMenuDialog, postMenuQueryKey]
  );

  const handleOpenShareMenu = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      setPostMenuAnchor(e.currentTarget as HTMLElement);
      handleSetupAndOpenShareMenu();
      openMenuDialog(postMenuQueryKey);
    },
    [handleSetupAndOpenShareMenu, openMenuDialog, postMenuQueryKey]
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

  const handlePostMenuOption = useCallback(
    async (
      e: React.MouseEvent,
      option:
        | "Edit"
        | "Delete"
        | "FollowProject"
        | "FollowUser"
        | "Report"
        | "Link"
        | "Via"
    ): Promise<void> => {
      e.preventDefault();
      e.stopPropagation();
      handleClosePostMenu(e);
      await new Promise((resolve) => {
        // Wait for option dialog to close
        window.setTimeout(resolve, 1);
      });
      if (option === "Delete") {
        handleDelete(e);
      }
      if (option === "FollowUser") {
        handleFollowUser(e, !followedUser);
      }
      if (option === "Report") {
        handleReport();
      }
      const absoluteUrl = window.origin + url;
      if (option === "Edit") {
        handleEdit(e);
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
              title: `Impower Project Pitch`,
              text: doc?.name,
              url: absoluteUrl,
            });
          }
        } catch {
          // Share was canceled
        }
      }
    },
    [
      doc?.name,
      followedUser,
      handleClosePostMenu,
      handleDelete,
      handleEdit,
      handleFollowUser,
      handleReport,
      url,
    ]
  );

  const createdAt =
    typeof doc?.pitchedAt === "string"
      ? doc?.pitchedAt
      : doc?.pitchedAt?.toDate()?.toJSON();
  const updatedAt =
    typeof doc?.repitchedAt === "string"
      ? doc?.repitchedAt
      : doc?.repitchedAt?.toDate()?.toJSON();

  const removed = doc?.removed || doc?.banned;
  const removedPlaceholder = `[removed]`;

  return (
    <>
      <PitchCardLayout
        cardRef={cardRef}
        buttonRef={buttonRef}
        scrollbarSpacerRef={scrollbarSpacerRef}
        titleRef={titleRef}
        openedActionsRef={openedActionsRef}
        closedActionsRef={closedActionsRef}
        config={config}
        icons={icons}
        projectType={doc?.projectType}
        name={removed ? removedPlaceholder : doc?.name}
        summary={removed ? removedPlaceholder : doc?.summary}
        tags={doc?.tags}
        author={doc?._author}
        createdBy={doc?._createdBy}
        delisted={delisted}
        createdAt={createdAt}
        updatedAt={updatedAt}
        score={doc?.score}
        pitchGoal={doc?.pitchGoal}
        kudoCount={doc?.kudos}
        contributionCount={doc?.contributions}
        contributed={contributed}
        liked={liked}
        disliked={disliked}
        kudoed={kudoed}
        connectedTo={connectedTo}
        connectedFrom={connectedFrom}
        preview={preview}
        style={style}
        buttonStyle={buttonStyle}
        scrollbarSpacerStyle={scrollbarSpacerStyle}
        openedActionsStyle={openedActionsStyle}
        closedActionsStyle={closedActionsStyle}
        onOpen={onOpen}
        onLike={handleLike}
        onDislike={handleDislike}
        onChangeScore={onChangeScore}
        onConnect={handleConnect}
        onOpenPostMenu={handleOpenPostMenu}
        onOpenShareMenu={handleOpenShareMenu}
      />
      {postMenuOpen !== undefined && (
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
});

export default PitchCard;
