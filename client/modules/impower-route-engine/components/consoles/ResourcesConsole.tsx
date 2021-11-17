import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { useMediaQuery } from "@material-ui/core";
import React, { useCallback, useContext, useMemo, useState } from "react";
import BullhornRegularIcon from "../../../../resources/icons/regular/bullhorn.svg";
import CircleInfoRegularIcon from "../../../../resources/icons/regular/circle-info.svg";
import PencilRegularIcon from "../../../../resources/icons/regular/pencil.svg";
import IllustrationImage from "../../../../resources/illustrations/clip-girl-drawing.svg";
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
import CreateResourceForm from "../../../impower-route/components/forms/CreateResourceForm";
import ResourceCreationFinishedSummary from "../../../impower-route/components/forms/ResourceCreationFinishedSummary";
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

interface ResourcesConsoleContentProps {
  scrollParent?: HTMLElement;
  loading?: boolean;
  cardDetails: { [key: string]: CardDetail };
  resourceDocs?: { [id: string]: ProjectDocument };
  resourceMemberDocs?: { [id: string]: MemberData };
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

const ResourcesConsoleContent = (
  props: ResourcesConsoleContentProps
): JSX.Element | null => {
  const {
    scrollParent,
    loading,
    cardDetails,
    resourceDocs,
    resourceMemberDocs,
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
    () => (resourceDocs ? Object.keys(resourceDocs) : undefined),
    [resourceDocs]
  );

  const getRowImage = useCallback(
    (id: string) => {
      const doc = resourceDocs?.[id];
      if (doc) {
        return doc.icon?.fileUrl;
      }
      return "";
    },
    [resourceDocs]
  );
  const getRowIcon = useCallback(
    (id: string): React.ReactNode => {
      const doc = resourceDocs?.[id];
      const mainTag = doc?.tags?.[0] || "";
      const tagIconNames =
        configState?.tagIconNames || ConfigCache.instance.params?.tagIconNames;
      const tagIconName = tagIconNames?.[mainTag] || "";
      if (doc) {
        return <DynamicIcon icon={tagIconName} />;
      }
      return undefined;
    },
    [configState?.tagIconNames, resourceDocs]
  );
  const getRowColor = useCallback(
    (id: string) => {
      const doc = resourceDocs?.[id];
      if (doc) {
        return doc.hex;
      }
      return "";
    },
    [resourceDocs]
  );

  const getCellDisplayValue = useCallback(
    (id: string, key: string): string => {
      const doc = resourceDocs?.[id];
      const memberDoc =
        resourceMemberDocs?.[id] ||
        (!doc?.restricted ? studioMemberDoc : undefined);
      if (doc) {
        if (key === "name") {
          return doc.name;
        }
        if (key === "type") {
          return "Resource";
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
        return String(doc[key]);
      }
      return "";
    },
    [resourceDocs, resourceMemberDocs, studioMemberDoc]
  );

  const getCellSortValue = useCallback(
    (id: string, key: string): string | number => {
      const doc = resourceDocs?.[id];
      if (doc) {
        if (key === "name") {
          return doc.name;
        }
        if (key === "type") {
          return "Resource";
        }
        if (key === "modified") {
          const updatedAt =
            typeof doc?._updatedAt === "string"
              ? new Date(doc?._updatedAt)
              : doc?._updatedAt?.toDate();
          return updatedAt.toJSON();
        }
        return getCellDisplayValue(id, key);
      }
      return "";
    },
    [resourceDocs, getCellDisplayValue]
  );

  const getRowMoreOptions = useCallback(
    (id: string) => {
      const doc = resourceDocs?.[id];
      const memberDoc =
        resourceMemberDocs?.[id] ||
        (!doc?.restricted ? studioMemberDoc : undefined);
      if (doc) {
        const pitchOptions =
          memberDoc?.access === MemberAccess.Owner
            ? doc.pitched
              ? ["View Pitch"]
              : ["Pitch Resource"]
            : [];
        const pageOptions = ["View Public Page"];
        return [...pitchOptions, ...pageOptions];
      }
      return [];
    },
    [resourceDocs, resourceMemberDocs, studioMemberDoc]
  );

  const getOptionIcon = useCallback((option: string) => {
    if (option === "Edit Resource") {
      return <PencilRegularIcon />;
    }
    if (option === "Pitch Resource" || option === "View Pitch") {
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
      const doc = resourceDocs?.[id];
      if (option === "Edit Resource") {
        onClick(event as React.MouseEvent, id);
      }
      if (option === "Pitch Resource") {
        router.push(`/r/p?resource=${id}`);
      }
      if (option === "View Pitch") {
        router.push(`/r/p/${id}`);
      }
      if (option === "View Public Page") {
        router.push(`/r/${doc?.slug}`);
      }
    },
    [onClick, resourceDocs, router]
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

interface YourResourcesConsoleProps {
  scrollParent?: HTMLElement;
  studioId?: string;
  resourceDocs: { [id: string]: ProjectDocument };
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

const ResourcesConsole = (props: YourResourcesConsoleProps): JSX.Element => {
  const {
    scrollParent,
    studioId: studio,
    resourceDocs,
    emptyLabel,
    stickyStyle,
    fixedStyle,
  } = props;

  const [createDocId, setCreateDocId] = useState<string>();
  const [createDoc, setCreateDoc] = useState<ProjectDocument>();
  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>();
  const [canClose, setCanClose] = useState(true);
  const [, toastDispatch] = useContext(ToastContext);
  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [userState] = useContext(UserContext);
  const { uid, my_studio_memberships, my_project_memberships } = userState;

  const engineConsole = studioConsoles.find(
    (c) => c.type === EngineConsoleType.Resources
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
        setCreateDialogOpen(currState.e === "resource");
      }
    },
    []
  );
  const [openEditDialog, closeEditDialog] = useDialogNavigation(
    "e",
    handleBrowserNavigation
  );

  const handleAdd = useCallback(async () => {
    const Auth = (await import("../../../impower-auth/classes/auth")).default;
    const createResourceDocument = (
      await import("../../../impower-data-store/utils/createResourceDocument")
    ).default;
    const newResource = createResourceDocument({
      _createdBy: uid,
      _author: Auth.instance.author,
      studio,
      name: "",
      slug: "",
      owners: [uid],
    });
    setCreateDoc(newResource);
    setCreateDialogOpen(true);
    openEditDialog("resource");
  }, [studio, uid, openEditDialog]);

  const handleClick = useCallback(
    async (e: React.MouseEvent, id: string) => {
      if (id) {
        try {
          const router = (await import("next/router")).default;
          await router.push(`/e/r/${id}`);
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

  const handleSubmitted = useCallback(async () => {
    setCanClose(true);
  }, []);

  const handleUploadIcon = useCallback(
    (icon: StorageFile) => {
      setCreateDoc({ ...createDoc, icon });
    },
    [createDoc]
  );

  const resourceCount = resourceDocs ? Object.keys(resourceDocs).length : 0;
  const canAdd = studioMemberDoc?.access === MemberAccess.Owner;
  const footerLabel = `${resourceCount} resources`;

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
        <ResourcesConsoleContent
          scrollParent={scrollParent}
          loading={!resourceDocs}
          cardDetails={cardDetails}
          resourceDocs={resourceDocs}
          studioMemberDoc={studioMemberDoc}
          resourceMemberDocs={my_project_memberships}
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
        <CreateResourceForm
          docId={createDocId}
          doc={createDoc}
          onChange={setCreateDoc}
          onClose={handleCloseCreateMenu}
          onSubmit={handleSubmit}
          onSubmitted={handleSubmitted}
          finishedSummary={
            <ResourceCreationFinishedSummary
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

export default ResourcesConsole;
