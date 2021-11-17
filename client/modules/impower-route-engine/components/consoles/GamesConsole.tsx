import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { useMediaQuery } from "@material-ui/core";
import React, { useCallback, useContext, useMemo, useState } from "react";
import BullhornRegularIcon from "../../../../resources/icons/regular/bullhorn.svg";
import CircleInfoRegularIcon from "../../../../resources/icons/regular/circle-info.svg";
import PencilRegularIcon from "../../../../resources/icons/regular/pencil.svg";
import IllustrationImage from "../../../../resources/illustrations/clip-working-from-home-2.svg";
import { abbreviateAge, ConfigContext } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import format from "../../../impower-config/utils/format";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../../impower-confirm-dialog";
import { StorageFile } from "../../../impower-core";
import { MemberAccess, MemberData } from "../../../impower-data-state";
import { ProjectDocument } from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { DynamicIcon } from "../../../impower-icon";
import Illustration from "../../../impower-route-home/components/elements/Illustration";
import CreateGameForm from "../../../impower-route/components/forms/CreateGameForm";
import GameCreationFinishedSummary from "../../../impower-route/components/forms/GameCreationFinishedSummary";
import EditDialog from "../../../impower-route/components/popups/EditDialog";
import {
  EngineConsoleType,
  studioConsoles,
} from "../../../impower-route/types/info/console";
import { useRouter } from "../../../impower-router";
import { ToastContext, toastTop } from "../../../impower-toast";
import { UserContext } from "../../../impower-user";
import EngineConsoleList, { CardDetail } from "../lists/EngineConsoleList";

const discardInfo = {
  title: "Discard unsaved changes?",
  agreeLabel: "Discard",
  disagreeLabel: "Keep Editing",
};

interface GamesConsoleContentProps {
  scrollParent?: HTMLElement;
  loading?: boolean;
  cardDetails: { [key: string]: CardDetail };
  gameDocs?: { [id: string]: ProjectDocument };
  gameMemberDocs?: { [id: string]: MemberData };
  studioMemberDoc?: MemberData;
  createLabel: string;
  addLabel: string;
  selectedLabel: string;
  editMultipleLabel: string;
  contextLabel: string;
  searchLabel: string;
  clearLabel: string;
  sortLabel: string;
  filterLabel: string;
  footerLabel?: string;
  noneLabel?: string;
  backLabel?: string;
  doneLabel?: string;
  emptyBackground: React.ReactNode;
  fixedStyle?: React.CSSProperties;
  stickyStyle?: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
  onAdd?: () => void;
  onClick?: (e: React.MouseEvent, path: string) => void;
}

const GamesConsoleContent = (
  props: GamesConsoleContentProps
): JSX.Element | null => {
  const {
    scrollParent,
    loading,
    cardDetails,
    gameDocs,
    gameMemberDocs,
    studioMemberDoc,
    createLabel,
    addLabel,
    selectedLabel,
    editMultipleLabel,
    contextLabel,
    searchLabel,
    clearLabel,
    sortLabel,
    filterLabel,
    footerLabel,
    noneLabel,
    backLabel,
    doneLabel,
    emptyBackground,
    stickyStyle,
    fixedStyle,
    onAdd,
    onClick,
  } = props;

  const [configState] = useContext(ConfigContext);
  const router = useRouter();

  const ids = useMemo(
    () => (gameDocs ? Object.keys(gameDocs) : []),
    [gameDocs]
  );

  const getRowImage = useCallback(
    (id: string) => {
      const doc = gameDocs?.[id];
      if (doc) {
        return doc.icon?.fileUrl;
      }
      return "";
    },
    [gameDocs]
  );

  const getRowIcon = useCallback(
    (id: string): React.ReactNode => {
      const doc = gameDocs?.[id];
      if (doc) {
        const mainTag = doc?.tags?.[0] || "";
        const tagIconNames =
          configState?.tagIconNames ||
          ConfigCache.instance.params?.tagIconNames;
        const tagIconName = tagIconNames?.[mainTag] || "";
        return <DynamicIcon icon={tagIconName} />;
      }
      return undefined;
    },
    [configState?.tagIconNames, gameDocs]
  );

  const getRowColor = useCallback(
    (id: string) => {
      const doc = gameDocs?.[id];
      if (doc) {
        return doc.hex;
      }
      return "";
    },
    [gameDocs]
  );

  const getCellDisplayValue = useCallback(
    (id: string, key: string) => {
      const doc = gameDocs?.[id];
      const memberDoc =
        gameMemberDocs?.[id] ||
        (!doc?.restricted ? studioMemberDoc : undefined);
      if (doc) {
        if (key === "name") {
          return doc.name;
        }
        if (key === "modified") {
          if (doc._updatedAt) {
            const updatedAt =
              typeof doc?._updatedAt === "string"
                ? new Date(doc?._updatedAt)
                : doc?._updatedAt?.toDate();
            return format("Modified {date}", {
              date: abbreviateAge(updatedAt),
            });
          }
          return "";
        }
        if (key === "access") {
          if (memberDoc?.access) {
            return memberDoc.access;
          }
          return "";
        }
        const value = doc[key];
        return value as string;
      }
      return "";
    },
    [gameDocs, gameMemberDocs, studioMemberDoc]
  );

  const getCellSortValue = useCallback(
    (id: string, key: string): string | number => {
      const doc = gameDocs?.[id];
      if (doc) {
        if (key === "modified") {
          const updatedAt =
            typeof doc?._updatedAt === "string"
              ? new Date(doc?._updatedAt)
              : doc?._updatedAt?.toDate();
          return updatedAt.toJSON();
        }
      }
      return getCellDisplayValue(id, key);
    },
    [gameDocs, getCellDisplayValue]
  );

  const getRowMoreOptions = useCallback(
    (id: string) => {
      const doc = gameDocs?.[id];
      const memberDoc =
        gameMemberDocs?.[id] ||
        (!doc?.restricted ? studioMemberDoc : undefined);
      if (doc) {
        const pitchOptions =
          memberDoc?.access === MemberAccess.Owner
            ? doc.pitched
              ? ["View Pitch"]
              : ["Pitch Game"]
            : [];
        const pageOptions = ["View Public Page"];
        return [...pitchOptions, ...pageOptions];
      }
      return [];
    },
    [gameDocs, gameMemberDocs, studioMemberDoc]
  );

  const getOptionIcon = useCallback((option: string) => {
    if (option === "Edit Game") {
      return <PencilRegularIcon />;
    }
    if (option === "Pitch Game" || option === "View Pitch") {
      return <BullhornRegularIcon />;
    }
    if (option === "View Public Page") {
      return <CircleInfoRegularIcon />;
    }
    return undefined;
  }, []);

  const handleIsContextAllowed = useCallback((): boolean => {
    return studioMemberDoc?.access === MemberAccess.Owner;
  }, [studioMemberDoc?.access]);

  const handleMore = useCallback(
    async (
      event: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
      id: string,
      option: string
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const doc = gameDocs?.[id];
      if (option === "Edit Game") {
        onClick(event as React.MouseEvent, id);
      }
      if (option === "Pitch Game") {
        router.push(`/g/p?game=${id}`);
      }
      if (option === "View Pitch") {
        router.push(`/g/p/${id}`);
      }
      if (option === "View Public Page") {
        router.push(`/g/${doc.slug}`);
      }
    },
    [gameDocs, onClick, router]
  );

  const theme = useTheme();

  const belowBreakpoint = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <>
      <EngineConsoleList
        maxWidth={960}
        scrollParent={scrollParent}
        loading={loading}
        paths={ids}
        cardDetails={cardDetails}
        getRowImage={getRowImage}
        getRowIcon={getRowIcon}
        getRowColor={getRowColor}
        getRowMoreOptions={getRowMoreOptions}
        getCellDisplayValue={getCellDisplayValue}
        getCellSortValue={getCellSortValue}
        getOptionIcon={getOptionIcon}
        createLabel={createLabel}
        addLabel={addLabel}
        selectedLabel={selectedLabel}
        editMultipleLabel={editMultipleLabel}
        contextOptions={[contextLabel]}
        searchLabel={searchLabel}
        clearLabel={clearLabel}
        sortLabel={sortLabel}
        filterLabel={filterLabel}
        footerLabel={footerLabel}
        noneLabel={noneLabel}
        backLabel={backLabel}
        doneLabel={doneLabel}
        emptyBackground={emptyBackground}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
        onAdd={onAdd}
        onClick={onClick}
        onMore={handleMore}
        isContextAllowed={handleIsContextAllowed}
        belowBreakpoint={belowBreakpoint}
      />
    </>
  );
};

const StyledConsoleContentArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
`;

interface YourGamesConsoleProps {
  scrollParent?: HTMLElement;
  studioId?: string;
  gameDocs: { [id: string]: ProjectDocument };
  emptyLabel?: React.ReactNode;
  fixedStyle?: React.CSSProperties;
  stickyStyle?: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  };
}

const GamesConsole = (props: YourGamesConsoleProps): JSX.Element => {
  const {
    scrollParent,
    studioId: studio,
    gameDocs,
    emptyLabel,
    stickyStyle,
    fixedStyle,
  } = props;

  const engineConsole = studioConsoles.find(
    (c) => c.type === EngineConsoleType.Games
  );
  const {
    createLabel,
    addLabel,
    selectedLabel,
    editMultipleLabel,
    contextLabel,
    searchLabel,
    clearLabel,
    sortLabel,
    filterLabel,
    noneLabel,
    backLabel,
    doneLabel,
  } = engineConsole;

  const [, toastDispatch] = useContext(ToastContext);
  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [userState] = useContext(UserContext);
  const { uid, my_studio_memberships, my_project_memberships } = userState;

  const [createDocId, setCreateDocId] = useState<string>();
  const [createDoc, setCreateDoc] = useState<ProjectDocument>();
  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>();
  const [canClose, setCanClose] = useState(true);

  const studioMemberDoc = useMemo(() => {
    if (my_studio_memberships === undefined) {
      return undefined;
    }
    if (my_studio_memberships === null) {
      return null;
    }
    return my_studio_memberships[studio];
  }, [studio, my_studio_memberships]);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.e !== prevState?.e) {
        setCreateDialogOpen(currState.e === "game");
      }
    },
    []
  );
  const [openEditDialog, closeEditDialog] = useDialogNavigation(
    "e",
    handleBrowserNavigation
  );

  const handleAdd = useCallback(async () => {
    setCanClose(true);
    const Auth = (await import("../../../impower-auth/classes/auth")).default;
    const createGameDocument = (
      await import("../../../impower-data-store/utils/createGameDocument")
    ).default;
    const newGame = createGameDocument({
      _createdBy: uid,
      _author: Auth.instance.author,
      studio,
      name: "",
      slug: "",
      owners: [uid],
      projectType: "game",
    });
    setCreateDoc(newGame);
    setCreateDialogOpen(true);
    openEditDialog("game");
  }, [openEditDialog, studio, uid]);

  const handleClick = useCallback(
    async (e: React.MouseEvent, id: string) => {
      if (id) {
        try {
          const router = (await import("next/router")).default;
          await router.push(`/e/g/${id}`);
        } catch (error) {
          toastDispatch(toastTop(error.message, "error"));
        }
      }
    },
    [toastDispatch]
  );

  const handleCloseCreateMenu = useCallback(
    (
      e: React.MouseEvent,
      reason:
        | "backdropClick"
        | "escapeKeyDown"
        | "closeButtonClick"
        | "submitted"
    ) => {
      if (!canClose) {
        return;
      }
      if (reason === "submitted") {
        setCreateDialogOpen(false);
        closeEditDialog();
        return;
      }
      const onDiscardChanges = (): void => {
        setCreateDialogOpen(false);
        closeEditDialog();
      };
      const hasUnsavedChanges =
        createDoc?.name !== "" ||
        createDoc?.summary !== "" ||
        JSON.stringify(createDoc?.tags) !== JSON.stringify([]);
      if (hasUnsavedChanges) {
        confirmDialogDispatch(
          confirmDialogNavOpen(
            discardInfo.title,
            undefined,
            discardInfo.agreeLabel,
            onDiscardChanges,
            discardInfo.disagreeLabel
          )
        );
      } else {
        onDiscardChanges();
      }
    },
    [
      canClose,
      closeEditDialog,
      confirmDialogDispatch,
      createDoc?.name,
      createDoc?.summary,
      createDoc?.tags,
    ]
  );

  const handleSubmit = useCallback(async (e: React.MouseEvent, id: string) => {
    setCreateDocId(id);
    setCanClose(false);
  }, []);

  const handleSubmitted = useCallback(() => {
    setCanClose(true);
  }, []);

  const handleUploadIcon = useCallback(
    (icon: StorageFile) => {
      setCreateDoc({ ...createDoc, icon });
    },
    [createDoc]
  );

  const gameCount = gameDocs ? Object.keys(gameDocs).length : 0;
  const canAdd = studioMemberDoc?.access === MemberAccess.Owner;
  const footerLabel = `${gameCount} games`;

  const cardDetails = useMemo(
    () => ({
      name: {
        label: "Name",
        displayed: true,
        searchable: true,
        sortable: true,
      },
      modified: {
        label: "Modified",
        displayed: true,
        sortable: true,
      },
      access: {
        label: "Access",
        filterable: {
          "All Access Levels": "",
          "Owner": MemberAccess.Owner,
          "Editor": MemberAccess.Editor,
          "Viewer": MemberAccess.Viewer,
        },
      },
    }),
    []
  );

  return (
    <>
      <StyledConsoleContentArea
        className={StyledConsoleContentArea.displayName}
      >
        <GamesConsoleContent
          scrollParent={scrollParent}
          loading={!gameDocs}
          cardDetails={cardDetails}
          gameDocs={gameDocs}
          studioMemberDoc={studioMemberDoc}
          gameMemberDocs={my_project_memberships}
          createLabel={createLabel}
          addLabel={addLabel}
          selectedLabel={selectedLabel}
          editMultipleLabel={editMultipleLabel}
          contextLabel={contextLabel}
          searchLabel={searchLabel}
          clearLabel={clearLabel}
          sortLabel={sortLabel}
          filterLabel={filterLabel}
          footerLabel={footerLabel}
          noneLabel={noneLabel}
          backLabel={backLabel}
          doneLabel={doneLabel}
          emptyBackground={
            <>
              {emptyLabel}
              <Illustration
                imageStyle={{
                  width: "100%",
                  height: "60vh",
                }}
              >
                <IllustrationImage />
              </Illustration>
            </>
          }
          stickyStyle={stickyStyle}
          fixedStyle={fixedStyle}
          onAdd={canAdd ? handleAdd : undefined}
          onClick={handleClick}
        />
      </StyledConsoleContentArea>
      <EditDialog open={createDialogOpen} onClose={handleCloseCreateMenu}>
        <CreateGameForm
          docId={createDocId}
          doc={createDoc}
          onChange={setCreateDoc}
          onSubmit={handleSubmit}
          onSubmitted={handleSubmitted}
          onClose={handleCloseCreateMenu}
          finishedSummary={
            <GameCreationFinishedSummary
              docId={createDocId}
              doc={createDoc}
              onUploadIcon={handleUploadIcon}
            />
          }
        />
      </EditDialog>
    </>
  );
};

export default GamesConsole;
