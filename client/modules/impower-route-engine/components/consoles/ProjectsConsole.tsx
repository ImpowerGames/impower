import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { useMediaQuery } from "@material-ui/core";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { CreationStep } from "../../../impower-route/components/forms/CreateDocumentForm";
import CreateProjectForm from "../../../impower-route/components/forms/CreateProjectForm";
import ProjectCreationFinishedSummary from "../../../impower-route/components/forms/ProjectCreationFinishedSummary";
import EditDialog from "../../../impower-route/components/popups/EditDialog";
import {
  EngineConsoleType,
  studioConsoles,
} from "../../../impower-route/types/info/console";
import { useRouter } from "../../../impower-router";
import { ToastContext, toastTop } from "../../../impower-toast";
import { UserContext } from "../../../impower-user";
import EngineConsoleList, { CardDetail } from "../lists/EngineConsoleList";

const steps: CreationStep[] = [
  {
    title: "Create a Project",
    description: "What kind of project would you like to make?",
    propertyPaths: ["tags"],
  },
  {
    title: "What's it called?",
    propertyPaths: ["name"],
  },
  {
    title: "Last thing! Describe it!",
    propertyPaths: ["summary"],
  },
];

const submitLabel = "Create Project";

const discardInfo = {
  title: "Discard unsaved changes?",
  agreeLabel: "Discard",
  disagreeLabel: "Keep Editing",
};

interface ProjectsConsoleContentProps {
  scrollParent?: HTMLElement;
  loading?: boolean;
  cardDetails: { [key: string]: CardDetail };
  studioMemberships?: { [id: string]: MemberData };
  projectMemberships?: { [id: string]: MemberData };
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

const ProjectsConsoleContent = (
  props: ProjectsConsoleContentProps
): JSX.Element | null => {
  const {
    scrollParent,
    loading,
    cardDetails,
    studioMemberships,
    projectMemberships,
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
    () => (projectMemberships ? Object.keys(projectMemberships) : []),
    [projectMemberships]
  );

  const getRowImage = useCallback(
    (id: string) => {
      const data = projectMemberships?.[id];
      if (data) {
        return data?.p?.i;
      }
      return "";
    },
    [projectMemberships]
  );

  const getRowIcon = useCallback(
    (id: string): React.ReactNode => {
      const data = projectMemberships?.[id];
      if (data) {
        const mainTag = data?.p?.tags?.[0] || "";
        const tagIconNames =
          configState?.tagIconNames ||
          ConfigCache.instance.params?.tagIconNames;
        const tagDisambiguations =
          configState?.tagDisambiguations ||
          ConfigCache.instance.params?.tagDisambiguations;
        const validMainTag = tagDisambiguations[mainTag]?.[0] || mainTag;
        const tagIconName = tagIconNames?.[validMainTag] || "hashtag";
        return <DynamicIcon icon={tagIconName} />;
      }
      return undefined;
    },
    [
      configState?.tagDisambiguations,
      configState?.tagIconNames,
      projectMemberships,
    ]
  );

  const getRowColor = useCallback(
    (id: string) => {
      const data = projectMemberships?.[id];
      if (data) {
        return data?.p?.h;
      }
      return "";
    },
    [projectMemberships]
  );

  const getCellDisplayValue = useCallback(
    (id: string, key: string): string => {
      const data = projectMemberships?.[id];
      const memberDoc =
        projectMemberships?.[id] ||
        (!data?.restricted ? studioMemberships?.[data?.s?.id] : undefined);
      if (data) {
        if (key === "name") {
          return data?.p?.n;
        }
        if (key === "modified") {
          const accessedAt = new Date(data?.accessedAt || data?.t);
          return format("Modified {date}", {
            date: abbreviateAge(accessedAt),
          });
        }
        if (key === "access") {
          if (memberDoc?.access) {
            return memberDoc.access;
          }
          return "";
        }
        const value = data[key];
        return value as string;
      }
      return "";
    },
    [projectMemberships, studioMemberships]
  );

  const getCellSortValue = useCallback(
    (id: string, key: string): string | number => {
      const data = projectMemberships?.[id];
      if (data) {
        if (key === "modified") {
          return new Date(data?.accessedAt || data?.t).toJSON();
        }
      }
      return getCellDisplayValue(id, key);
    },
    [projectMemberships, getCellDisplayValue]
  );

  const getRowMoreOptions = useCallback(
    (id: string) => {
      const data = projectMemberships?.[id];
      const memberDoc =
        projectMemberships?.[id] ||
        (!data?.restricted ? studioMemberships?.[data?.s?.id] : undefined);
      if (data) {
        const pitchOptions =
          memberDoc?.access === MemberAccess.Owner
            ? data.pitched
              ? ["View Pitch"]
              : ["Pitch Project"]
            : [];
        const pageOptions = ["View Public Page"];
        return [...pitchOptions, ...pageOptions];
      }
      return [];
    },
    [projectMemberships, studioMemberships]
  );

  const getOptionIcon = useCallback((option: string) => {
    if (option === "Edit Project") {
      return <PencilRegularIcon />;
    }
    if (option === "Pitch Project" || option === "View Pitch") {
      return <BullhornRegularIcon />;
    }
    if (option === "View Public Page") {
      return <CircleInfoRegularIcon />;
    }
    return undefined;
  }, []);

  const handleIsContextAllowed = useCallback(
    (id: string): boolean => {
      const data = projectMemberships?.[id];
      const studioMembership = studioMemberships?.[data?.s?.id];
      return studioMembership?.access === MemberAccess.Owner;
    },
    [projectMemberships, studioMemberships]
  );

  const handleMore = useCallback(
    async (
      event: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
      id: string,
      option: string
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const data = projectMemberships?.[id];
      if (option === "Edit Project") {
        onClick(event as React.MouseEvent, id);
      }
      if (option === "Pitch Project") {
        router.push(`/g/p?project=${id}`);
      }
      if (option === "View Pitch") {
        router.push(`/g/p/${id}`);
      }
      if (option === "View Public Page") {
        router.push(`/g/${data.slug}`);
      }
    },
    [projectMemberships, onClick, router]
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

interface YourProjectsConsoleProps {
  scrollParent?: HTMLElement;
  studioId?: string;
  studioMemberships: { [id: string]: MemberData };
  projectMemberships: { [id: string]: MemberData };
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

const ProjectsConsole = (props: YourProjectsConsoleProps): JSX.Element => {
  const {
    scrollParent,
    studioId,
    studioMemberships,
    projectMemberships,
    emptyLabel,
    stickyStyle,
    fixedStyle,
  } = props;

  const engineConsole = studioConsoles.find(
    (c) => c.type === EngineConsoleType.Projects
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
  const { uid } = userState;

  const [createDocId, setCreateDocId] = useState<string>();
  const [createDoc, setCreateDoc] = useState<ProjectDocument>();
  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>();
  const [canClose, setCanClose] = useState(true);

  const projectMembershipsStateRef = useRef(projectMemberships);
  const [projectMembershipsState, setProjectMembershipsState] = useState(
    projectMembershipsStateRef.current
  );

  useEffect(() => {
    projectMembershipsStateRef.current = projectMemberships;
    setProjectMembershipsState({ ...projectMembershipsStateRef.current });
  }, [projectMemberships]);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.e !== prevState?.e) {
        setCreateDialogOpen(currState.e === "project");
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
    const createProjectDocument = (
      await import("../../../impower-data-store/utils/createProjectDocument")
    ).default;
    const newProject = createProjectDocument({
      _createdBy: uid,
      _author: Auth.instance.author,
      studio: studioId,
      name: "",
      slug: "",
      owners: [uid],
      projectType: "game",
      engine: true,
    });
    setCreateDoc(newProject);
    setCreateDialogOpen(true);
    openEditDialog("project");
  }, [openEditDialog, studioId, uid]);

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

  const handleSubmit = useCallback(
    async (e: React.MouseEvent, id: string, doc: ProjectDocument) => {
      setCreateDocId(id);
      projectMembershipsStateRef.current = {
        ...(projectMembershipsStateRef.current || {}),
        [id]: doc,
      };
      setProjectMembershipsState(projectMembershipsStateRef.current);
      setCanClose(false);
    },
    []
  );

  const handleSubmitted = useCallback(() => {
    setCanClose(true);
  }, []);

  const handleUploadIcon = useCallback(
    (icon: StorageFile) => {
      setCreateDoc({ ...createDoc, icon });
    },
    [createDoc]
  );

  const projectCount = projectMembershipsState
    ? Object.keys(projectMembershipsState).length
    : 0;
  const canAdd = studioMemberships?.[studioId]?.access === MemberAccess.Owner;
  const footerLabel = `${projectCount} projects`;

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
        <ProjectsConsoleContent
          scrollParent={scrollParent}
          loading={!projectMembershipsState}
          cardDetails={cardDetails}
          studioMemberships={studioMemberships}
          projectMemberships={projectMembershipsState}
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
        <CreateProjectForm
          docId={createDocId}
          doc={createDoc}
          steps={steps}
          submitLabel={submitLabel}
          onChange={setCreateDoc}
          onSubmit={handleSubmit}
          onSubmitted={handleSubmitted}
          onClose={handleCloseCreateMenu}
          finishedSummary={
            <ProjectCreationFinishedSummary
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

export default ProjectsConsole;
