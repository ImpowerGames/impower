import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import MobileStepper from "@material-ui/core/MobileStepper";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileData } from "../../../../../spark-engine";
import AngleLeftRegularIcon from "../../../../resources/icons/regular/angle-left.svg";
import AngleRightRegularIcon from "../../../../resources/icons/regular/angle-right.svg";
import FolderArrowUpRegularIcon from "../../../../resources/icons/regular/folder-arrow-up.svg";
import ImagePolaroidRegularIcon from "../../../../resources/icons/regular/image-polaroid.svg";
import PencilRegularIcon from "../../../../resources/icons/regular/pencil.svg";
import TextRegularIcon from "../../../../resources/icons/regular/text.svg";
import TrashCanRegularIcon from "../../../../resources/icons/regular/trash-can.svg";
import UploadRegularIcon from "../../../../resources/icons/regular/upload.svg";
import VideoRegularIcon from "../../../../resources/icons/regular/video.svg";
import VolumeHighRegularIcon from "../../../../resources/icons/regular/volume-high.svg";
import { abbreviateAge } from "../../../impower-config";
import format from "../../../impower-config/utils/format";
import { FileExtension, getFileContentType } from "../../../impower-core";
import { ProjectDocument } from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { FontIcon } from "../../../impower-icon";
import EditDialog from "../../../impower-route/components/popups/EditDialog";
import {
  EngineConsoleType,
  projectConsoles,
} from "../../../impower-route/types/info/console";
import {
  getFileSizeDisplayValue,
  getFileSizeLimit,
} from "../../../impower-storage";
import { ToastContext, toastTop } from "../../../impower-toast";
import { UserContext } from "../../../impower-user";
import userQueueFileUpload from "../../../impower-user/utils/userQueueFileUpload";
import userUpdateFileUploadState from "../../../impower-user/utils/userUpdateFileUploadState";
import { getProjectColor } from "../../utils/getProjectColor";
import EditFileForm from "../forms/EditFileForm";
import EngineConsoleList, { CardDetail } from "../lists/EngineConsoleList";

const StyledMobileStepper = styled(MobileStepper)`
  background-color: black;
  color: white;
`;

const StyledButton = styled(Button)`
  color: white;
`;

interface FilesConsoleContentProps {
  studioId: string;
  scrollParent: HTMLElement;
  projectId: string;
  cardDetails: { [key: string]: CardDetail };
  currentPath: string;
  docsByPath: { [path: string]: FileData };
  createLabel: string;
  title: string;
  addLabel: string;
  searchLabel: string;
  deleteLabel: string;
  moveLabel: string;
  editMultipleLabel: string;
  selectedLabel: string;
  selectAllLabel: string;
  deselectAllLabel: string;
  backLabel: string;
  doneLabel: string;
  clearLabel: string;
  noneLabel: string;
  sortLabel: string;
  filterLabel: string;
  footerLabel?: React.ReactNode;
  copyLabel: string;
  loading: boolean;
  addDisabled?: boolean;
  upload?: boolean;
  selectedColor?: string;
  emptyBackground?: React.ReactNode;
  fixedStyle?: React.CSSProperties;
  stickyStyle?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  leftStyle?: React.CSSProperties;
  moreButtonStyle?: React.CSSProperties;
  searchButtonStyle?: React.CSSProperties;
  dividerStyle?: React.CSSProperties;
  paperStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  sticky?: "always" | "collapsible" | "never";
  onChangeCurrentPath?: (path: string) => void;
  onClick?: (e: React.MouseEvent, path: string) => void;
  onUploadStart?: (path: string, file: FileData) => void;
  onDelete?: (path: string) => void;
  onReorder?: (paths: string[]) => void;
}

const FilesConsoleContent = (
  props: FilesConsoleContentProps
): JSX.Element | null => {
  const {
    scrollParent,
    projectId,
    cardDetails,
    currentPath,
    docsByPath,
    title,
    createLabel,
    addLabel,
    deleteLabel,
    searchLabel,
    editMultipleLabel,
    selectedLabel,
    selectAllLabel,
    deselectAllLabel,
    backLabel,
    doneLabel,
    clearLabel,
    noneLabel,
    sortLabel,
    filterLabel,
    footerLabel,
    loading,
    addDisabled,
    selectedColor,
    emptyBackground,
    stickyStyle,
    fixedStyle,
    headerStyle,
    leftStyle,
    moreButtonStyle,
    searchButtonStyle,
    dividerStyle,
    paperStyle,
    style,
    sticky,
    onChangeCurrentPath,
    onClick,
    onUploadStart,
    onDelete,
    onReorder,
  } = props;

  const [, userDispatch] = useContext(UserContext);
  const [, toastDispatch] = useContext(ToastContext);

  const paths = useMemo(
    () => (docsByPath ? Object.keys(docsByPath) : undefined),
    [docsByPath]
  );
  const handleGetUploadLabel = useCallback(() => {
    return "Upload Files";
  }, []);
  const handleGetRowImage = useCallback(
    (path: string) => {
      const doc = docsByPath?.[path];
      if (doc?.fileType?.startsWith("image/svg")) {
        return doc?.fileUrl;
      }
      if (doc?.fileType?.startsWith("image") && doc?.storageKey) {
        return doc?.thumbUrl || doc?.fileUrl || "";
      }
      return "";
    },
    [docsByPath]
  );
  const handleGetRowImagePlaceholder = useCallback(
    (path: string) => {
      const doc = docsByPath?.[path];
      if (
        doc?.fileType?.startsWith("image") &&
        !doc?.fileType?.startsWith("image/svg") &&
        doc?.storageKey
      ) {
        return doc?.thumbUrl || doc?.blurUrl || doc?.fileUrl;
      }
      return "";
    },
    [docsByPath]
  );

  const handleGetRowIcon = useCallback(
    (path: string) => {
      const doc = docsByPath?.[path];
      const contentType = doc?.contentType || doc?.fileType?.toLowerCase();
      if (contentType?.startsWith("image")) {
        return <ImagePolaroidRegularIcon />;
      }
      if (contentType?.startsWith("audio")) {
        return <VolumeHighRegularIcon />;
      }
      if (contentType?.startsWith("video")) {
        return <VideoRegularIcon />;
      }
      if (contentType?.startsWith("text")) {
        return <TextRegularIcon />;
      }
      return undefined;
    },
    [docsByPath]
  );
  const handleGetRowColor = useCallback(
    (path: string) => {
      const doc = docsByPath?.[path];
      const contentType = doc?.contentType || doc?.fileType?.toLowerCase();
      if (contentType?.startsWith("image")) {
        return "transparent";
      }
      if (contentType?.startsWith("audio")) {
        return getProjectColor("red", 5);
      }
      if (contentType?.startsWith("video")) {
        return getProjectColor("orange", 5);
      }
      if (contentType?.startsWith("text")) {
        return getProjectColor("blue", 5);
      }
      return "";
    },
    [docsByPath]
  );
  const handleGetRowMoreOptions = useCallback(() => {
    return ["Replace", "---", "Delete"];
  }, []);
  const handleGetOptionIcon = useCallback((option: string) => {
    if (option === "Edit") {
      return <PencilRegularIcon />;
    }
    if (option === "Replace") {
      return <UploadRegularIcon />;
    }
    if (option === "Move") {
      return <FolderArrowUpRegularIcon />;
    }
    if (option === "Delete") {
      return <TrashCanRegularIcon />;
    }
    if (option === "Edit") {
      return <PencilRegularIcon />;
    }
    if (option === "Rename") {
      return <PencilRegularIcon />;
    }
    return undefined;
  }, []);
  const handleIsOptionUpload = useCallback((option: string): boolean => {
    if (option === "Replace") {
      return true;
    }
    return false;
  }, []);
  const handleIsOptionDisabled = useCallback(
    (paths: string[], option: string): boolean => {
      if (option === "Delete") {
        return !paths || paths.length === 0;
      }
      if (option === "Move") {
        return !paths || paths.length === 0;
      }
      return false;
    },
    []
  );

  const handleDeleteFile = useCallback(
    async (path: string): Promise<void> => {
      const doc = docsByPath?.[path];
      if (doc?.storageKey) {
        try {
          onDelete(path);
          const DataStateWrite = (
            await import("../../../impower-data-state/classes/dataStateWrite")
          ).default;
          await new DataStateWrite(
            "projects",
            projectId,
            "files",
            "data",
            doc?.fileId
          ).set(null);
        } catch (error) {
          toastDispatch(toastTop(error.message, "error"));
          const logError = (
            await import("../../../impower-logger/utils/logError")
          ).default;
          logError("Storage", error);
        }
      }
    },
    [docsByPath, onDelete, projectId, toastDispatch]
  );

  const handleDelete = useCallback(
    async (paths: string[]): Promise<void> => {
      const nestedDeletedPaths = paths.flatMap((deletedPath) => [deletedPath]);
      await Promise.all(
        nestedDeletedPaths.map((path) => handleDeleteFile(path))
      );
    },
    [handleDeleteFile]
  );

  const handleUpload = useCallback(
    async (files: FileList, path: string) => {
      const getUuid = (await import("../../../impower-core/utils/getUuid"))
        .default;
      const filesToUpload = !path || path.endsWith("/") ? files : [files[0]];
      const filesArray = Array.from(filesToUpload);
      if (filesArray.some((file) => file.size > getFileSizeLimit())) {
        const error =
          filesArray.length > 1
            ? "All file sizes must be less than 10mb"
            : "File size must be less than 10mb";
        toastDispatch(toastTop(error, "error"));
        return;
      }
      const isFolder = !path || path.endsWith("/");
      const folderPath = isFolder
        ? path
        : `${path.split("/").slice(0, -1).join("/")}/`;

      const docPathsByName: { [name: string]: string } = {};
      Object.entries(docsByPath).forEach(([p, d]) => {
        docPathsByName[d.name] = p;
      });
      const fileInfos = filesArray.map((file) => {
        const newFileName = file.name;
        const lastDotIndex = newFileName.lastIndexOf(".");
        const ext = newFileName.substring(lastDotIndex + 1) as FileExtension;
        const newName = newFileName.slice(
          0,
          newFileName.length - ext.length - 1
        );
        const existingDocPath = isFolder ? docPathsByName[newName] : path;
        const fileId = existingDocPath
          ? existingDocPath.split("/").slice(-1).join("")
          : getUuid();
        const newDocPath = folderPath + fileId;
        const currentDoc: FileData = docsByPath?.[newDocPath] as FileData;
        const fileName = currentDoc?.fileName || newFileName;
        const name = currentDoc?.name || newName;
        const fileExtension = ext;
        const fileType = getFileContentType(ext);
        const newDoc = {
          fileType,
          fileExtension,
          fileName,
          fileId,
          project: projectId,
          size: file.size,
          name,
          t: new Date().getTime(),
        };
        return {
          file,
          currentDoc,
          newDoc,
        };
      });
      fileInfos.forEach(({ newDoc }) => {
        onUploadStart?.(folderPath + newDoc.fileId, newDoc);
      });
      for (let i = 0; i < fileInfos.length; i += 1) {
        const fileInfo = fileInfos[i];
        const path = folderPath + fileInfo.newDoc.fileId;
        userDispatch(
          userQueueFileUpload({
            path,
            file: fileInfo.file,
            metadata: fileInfo.newDoc,
          })
        );
      }
    },
    [docsByPath, toastDispatch, projectId, onUploadStart, userDispatch]
  );

  const handleAdd = useCallback(
    async (
      event: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
      path: string
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const inputEvent = event as React.ChangeEvent<HTMLInputElement>;
      if (inputEvent?.target?.files?.length > 0) {
        handleUpload(inputEvent?.target?.files, path);
      }
    },
    [handleUpload]
  );

  const handleClickContextOption = useCallback(
    async (paths: string[], option: string) => {
      if (option === "Delete") {
        handleDelete(paths);
      }
    },
    [handleDelete]
  );

  const handleMore = useCallback(
    async (
      event: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
      path: string,
      option: string
    ) => {
      event.preventDefault();
      event.stopPropagation();
      if (option === "Replace") {
        const inputEvent = event as React.ChangeEvent<HTMLInputElement>;
        if (inputEvent?.target?.files?.length > 0) {
          handleUpload(inputEvent.target.files, path);
        }
      }
      if (option === "Delete") {
        handleDelete([path]);
      }
    },
    [handleDelete, handleUpload]
  );

  const handleGetCellDisplayValue = useCallback(
    (path: string, key: string): string => {
      const doc = docsByPath?.[path];
      if (key === "name") {
        return doc?.name || doc?.fileName;
      }
      if (key === "type") {
        return doc?.contentType || doc?.fileType?.toLowerCase();
      }
      if (key === "size") {
        return getFileSizeDisplayValue(doc?.size || 0) || "";
      }
      if (key === "modified") {
        const updated =
          typeof doc?.t === "string" ? new Date(doc?.t) : new Date();
        return format("Modified {date}", {
          date: abbreviateAge(updated),
        });
        return "";
      }
      return String(doc?.[key]);
    },
    [docsByPath]
  );
  const handleGetCellSortValue = useCallback(
    (path: string, key: string): string | number => {
      const doc = docsByPath?.[path];
      if (key === "size") {
        return doc?.size;
      }
      if (key === "modified") {
        const updated =
          typeof doc?.t === "string" ? new Date(doc?.t) : new Date();
        return updated.toJSON();
      }
      return handleGetCellDisplayValue(path, key);
    },
    [docsByPath, handleGetCellDisplayValue]
  );

  const handleIsUploadAllowed = useCallback((): boolean => {
    return true;
  }, []);

  const handleIsContextAllowed = useCallback((): boolean => {
    return true;
  }, []);

  const contextOptions = useMemo(() => [deleteLabel], [deleteLabel]);

  return (
    <>
      <EngineConsoleList
        scrollParent={scrollParent}
        loading={loading}
        paths={paths}
        cardDetails={cardDetails}
        rowNameKey="name"
        getUploadLabel={handleGetUploadLabel}
        getRowImage={handleGetRowImage}
        getRowImagePlaceholder={handleGetRowImagePlaceholder}
        getRowIcon={handleGetRowIcon}
        getRowColor={handleGetRowColor}
        getRowMoreOptions={handleGetRowMoreOptions}
        getOptionIcon={handleGetOptionIcon}
        isOptionUpload={handleIsOptionUpload}
        isOptionDisabled={handleIsOptionDisabled}
        getCellDisplayValue={handleGetCellDisplayValue}
        getCellSortValue={handleGetCellSortValue}
        defaultSortKey="name"
        defaultSortOrder="asc"
        title={title}
        createLabel={createLabel}
        addLabel={addLabel}
        contextOptions={contextOptions}
        searchLabel={searchLabel}
        editMultipleLabel={editMultipleLabel}
        selectedLabel={selectedLabel}
        selectAllLabel={selectAllLabel}
        deselectAllLabel={deselectAllLabel}
        backLabel={backLabel}
        doneLabel={doneLabel}
        clearLabel={clearLabel}
        noneLabel={noneLabel}
        sortLabel={sortLabel}
        filterLabel={filterLabel}
        footerLabel={footerLabel}
        currentPath={currentPath}
        createDisabled={addDisabled}
        emptyBackground={emptyBackground}
        selectedColor={selectedColor}
        stickyStyle={stickyStyle}
        fixedStyle={fixedStyle}
        headerStyle={headerStyle}
        leftStyle={leftStyle}
        moreButtonStyle={moreButtonStyle}
        searchButtonStyle={searchButtonStyle}
        dividerStyle={dividerStyle}
        paperStyle={paperStyle}
        style={style}
        sticky={sticky}
        upload
        belowBreakpoint
        onChangeCurrentPath={onChangeCurrentPath}
        onClickContextOption={handleClickContextOption}
        onAdd={handleAdd}
        onMore={handleMore}
        onClick={onClick}
        isUploadAllowed={handleIsUploadAllowed}
        isContextAllowed={handleIsContextAllowed}
        onUploadFiles={handleUpload}
        onReorder={onReorder}
      />
    </>
  );
};

const StyledConsoleContentArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

interface FilesConsoleProps {
  scrollParent: HTMLElement;
  projectDoc: ProjectDocument;
  projectId: string;
  fileDocs: { [id: string]: FileData };
  selectedColor?: string;
  fixedStyle?: React.CSSProperties;
  stickyStyle?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  leftStyle?: React.CSSProperties;
  moreButtonStyle?: React.CSSProperties;
  searchButtonStyle?: React.CSSProperties;
  dividerStyle?: React.CSSProperties;
  paperStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  sticky?: "always" | "collapsible" | "never";
}

const FilesConsole = (props: FilesConsoleProps): JSX.Element => {
  const {
    scrollParent,
    projectDoc,
    projectId,
    fileDocs,
    selectedColor,
    stickyStyle,
    fixedStyle,
    headerStyle,
    leftStyle,
    moreButtonStyle,
    searchButtonStyle,
    dividerStyle,
    paperStyle,
    style,
    sticky,
  } = props;

  const [userState, userDispatch] = useContext(UserContext);

  const studioId = projectDoc.studio;

  const [editDialogOpen, setEditDialogOpen] = useState<boolean>();
  const [editIndex, setEditIndex] = useState<number>();

  const initialDocsByPath = useMemo<{
    [path: string]: FileData;
  }>(() => {
    const docs = {};
    if (fileDocs) {
      Object.entries(fileDocs).forEach(([id, doc]) => {
        const path = `/${id}`;
        docs[path] = doc;
      });
    }
    return docs;
  }, [fileDocs]);
  const docsByPathRef = useRef(initialDocsByPath);
  const [docsByPath, setDocsByPath] = useState(docsByPathRef.current);
  const [visibleOrderedPaths, setVisibleOrderedPaths] = useState<string[]>();

  const [currentPath, setCurrentPath] = useState<string>("/");

  const editDocPath = visibleOrderedPaths?.[editIndex];
  const editDocId = docsByPath?.[editDocPath]?.fileId;
  const editDoc = docsByPath?.[editDocPath];

  const engineConsole = projectConsoles.find(
    (c) => c.type === EngineConsoleType.Files
  );
  const {
    name,
    createLabel,
    addLabel,
    contextLabel,
    moveLabel,
    searchLabel,
    editMultipleLabel,
    selectedLabel,
    selectAllLabel,
    deselectAllLabel,
    backLabel,
    doneLabel,
    clearLabel,
    noneLabel,
    sortLabel,
    filterLabel,
    copyLabel,
  } = engineConsole;

  useEffect(() => {
    if (fileDocs) {
      Object.keys(docsByPathRef.current).forEach((path) => {
        const id = path.split("/").slice(-1).join("");
        if (!fileDocs[id]) {
          delete docsByPathRef.current[path];
        }
      });
      Object.entries(fileDocs).forEach(([id, doc]) => {
        const path = `/${id}`;
        docsByPathRef.current[path] = doc;
        userDispatch(userUpdateFileUploadState(path, "ready"));
      });
      setDocsByPath({ ...docsByPathRef.current });
    } else {
      setDocsByPath(undefined);
    }
  }, [fileDocs, userDispatch]);

  const cardDetails = useMemo(
    () => ({
      name: {
        label: "Name",
        displayed: true,
        searchable: true,
        sortable: true,
      },
      type: {
        label: "Type",
        filterable: {
          "All Types": "",
          "Image": "image/*",
          "Audio": "audio/*",
          "Video": "video/*",
          "Text": "text/*",
        },
        sortable: true,
      },
      modified: {
        label: "Modified",
        displayed: true,
        sortable: true,
      },
      size: {
        label: "Size",
        displayed: true,
        sortable: true,
      },
    }),
    []
  );

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.e !== prevState?.e) {
        setEditDialogOpen(currState.e === "file");
      }
    },
    []
  );
  const [openEditDialog, closeEditDialog] = useDialogNavigation(
    "e",
    handleBrowserNavigation
  );

  const handleClick = useCallback(
    async (e: React.MouseEvent, path: string) => {
      setEditIndex(visibleOrderedPaths.indexOf(path));
      setEditDialogOpen(true);
      openEditDialog("file");
    },
    [visibleOrderedPaths, openEditDialog]
  );
  const handleDelete = useCallback((path: string) => {
    if (docsByPathRef.current[path]) {
      delete docsByPathRef.current[path];
      setDocsByPath({ ...docsByPathRef.current });
    }
  }, []);
  const handleReorder = useCallback((paths: string[]) => {
    setVisibleOrderedPaths(paths);
  }, []);

  const handleChangeEditDoc = useCallback(
    async (doc: FileData) => {
      const DataStateWrite = (
        await import("../../../impower-data-state/classes/dataStateWrite")
      ).default;
      if (doc?.fileId) {
        await new DataStateWrite(
          "projects",
          projectId,
          "files",
          "data",
          doc?.fileId
        ).update(doc);
      }
    },
    [projectId]
  );

  const handleCloseEditDialog = useCallback(() => {
    setEditDialogOpen(false);
    closeEditDialog();
  }, [closeEditDialog]);

  const handlePrevious = useCallback(() => {
    setEditIndex(editIndex - 1);
  }, [editIndex]);

  const handleNext = useCallback(() => {
    setEditIndex(editIndex + 1);
  }, [editIndex]);

  const uploadingDocs = useMemo(() => {
    const uploading: Record<string, FileData> = {};
    Object.entries(userState?.uploads || {}).forEach(([path, upload]) => {
      if (upload?.metadata?.project === projectId) {
        uploading[path] = upload.metadata as FileData;
      }
    });
    return uploading;
  }, [projectId, userState?.uploads]);

  const allDocsByPath = useMemo(
    () => ({
      ...docsByPath,
      ...uploadingDocs,
      ...docsByPath,
    }),
    [docsByPath, uploadingDocs]
  );

  return (
    <>
      <StyledConsoleContentArea>
        <FilesConsoleContent
          studioId={studioId}
          scrollParent={scrollParent}
          projectId={projectId}
          cardDetails={cardDetails}
          currentPath={currentPath}
          docsByPath={allDocsByPath}
          createLabel={createLabel}
          title={name}
          addLabel={addLabel}
          deleteLabel={contextLabel}
          moveLabel={moveLabel}
          searchLabel={searchLabel}
          editMultipleLabel={editMultipleLabel}
          selectedLabel={selectedLabel}
          selectAllLabel={selectAllLabel}
          deselectAllLabel={deselectAllLabel}
          backLabel={backLabel}
          doneLabel={doneLabel}
          clearLabel={clearLabel}
          noneLabel={noneLabel}
          sortLabel={sortLabel}
          filterLabel={filterLabel}
          copyLabel={copyLabel}
          loading={!fileDocs}
          selectedColor={selectedColor}
          stickyStyle={stickyStyle}
          fixedStyle={fixedStyle}
          headerStyle={headerStyle}
          leftStyle={leftStyle}
          moreButtonStyle={moreButtonStyle}
          searchButtonStyle={searchButtonStyle}
          dividerStyle={dividerStyle}
          paperStyle={paperStyle}
          style={style}
          sticky={sticky}
          onChangeCurrentPath={setCurrentPath}
          onClick={handleClick}
          onDelete={handleDelete}
          onReorder={handleReorder}
        />
      </StyledConsoleContentArea>
      <EditDialog
        open={editDialogOpen}
        fullScreen
        onClose={handleCloseEditDialog}
      >
        <EditFileForm
          docId={editDocId}
          doc={editDoc as FileData}
          onClose={handleCloseEditDialog}
          onChange={handleChangeEditDoc}
        />
        <StyledMobileStepper
          steps={visibleOrderedPaths?.length}
          position="static"
          variant="text"
          activeStep={editIndex}
          backButton={
            <StyledButton disabled={editIndex === 0} onClick={handlePrevious}>
              <FontIcon aria-label="Next" size={16}>
                <AngleLeftRegularIcon />
              </FontIcon>
            </StyledButton>
          }
          nextButton={
            <StyledButton
              disabled={editIndex === (visibleOrderedPaths?.length || 0) - 1}
              onClick={handleNext}
            >
              <FontIcon aria-label="Next" size={16}>
                <AngleRightRegularIcon />
              </FontIcon>
            </StyledButton>
          }
        />
      </EditDialog>
    </>
  );
};

export default FilesConsole;
