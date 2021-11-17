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
import {
  FileContentType,
  FileExtension,
  getFileContentType,
} from "../../../impower-core";
import getDataStatePath from "../../../impower-data-state/utils/getDataStatePath";
import { ProjectDocument } from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import {
  createFileData,
  FileData,
  FolderData,
  isFileData,
  isFolderData,
} from "../../../impower-game/data";
import { getProjectColor } from "../../../impower-game/inspector";
import { FontIcon } from "../../../impower-icon";
import EditDialog from "../../../impower-route/components/popups/EditDialog";
import {
  EngineConsoleType,
  projectConsoles,
} from "../../../impower-route/types/info/console";
import {
  getAbsoluteUrl,
  getFileSizeDisplayValue,
  getFileSizeLimit,
} from "../../../impower-storage";
import { ToastContext, toastTop } from "../../../impower-toast";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { projectChangeInstanceData } from "../../types/actions/projectActions";
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
  idsByPath: { [path: string]: string };
  docsByPath: { [path: string]: FileData | FolderData };
  pathsByFolder: { [folder: string]: string[] };
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
  uploadProgress?: {
    [path: string]: { bytesTransferred: number; totalBytes: number };
  };
  selectedColor?: string;
  emptyBackground?: React.ReactNode;
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
  headerStyle?: React.CSSProperties;
  leftStyle?: React.CSSProperties;
  moreButtonStyle?: React.CSSProperties;
  searchButtonStyle?: React.CSSProperties;
  dividerStyle?: React.CSSProperties;
  paperStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  sticky?: "always" | "collapsible" | "never";
  stickyOffset?: number;
  onChangeCurrentPath?: (path: string) => void;
  onClick?: (e: React.MouseEvent, path: string) => void;
  onUploadStart?: (path: string, file: FileData) => void;
  onDelete?: (path: string) => void;
  onUploadProgress?: (
    path: string,
    bytesTransferred: number,
    totalBytes: number
  ) => void;
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
    idsByPath,
    docsByPath,
    pathsByFolder,
    title,
    createLabel,
    addLabel,
    deleteLabel,
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
    footerLabel,
    loading,
    addDisabled,
    selectedColor,
    emptyBackground,
    uploadProgress,
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
    stickyOffset,
    onChangeCurrentPath,
    onClick,
    onUploadStart,
    onUploadProgress,
    onDelete,
    onReorder,
  } = props;

  const [, toastDispatch] = useContext(ToastContext);

  const paths = useMemo(
    () => (docsByPath ? Object.keys(docsByPath) : undefined),
    [docsByPath]
  );
  const getUploadLabel = useCallback(() => {
    return "Upload Files";
  }, []);
  const getRowImage = useCallback(
    (path: string) => {
      const doc = docsByPath?.[path];
      if (isFileData(doc)) {
        const { storageKey } = doc;
        const { contentType } = doc;
        if (contentType?.startsWith("image") && storageKey) {
          if (doc.thumbUrl) {
            return doc.thumbUrl;
          }
          if (doc.fileUrl) {
            return doc.fileUrl;
          }
          if (doc.storageKey) {
            return getAbsoluteUrl(`/${storageKey}`);
          }
        }
      }
      return "";
    },
    [docsByPath]
  );
  const getRowIcon = useCallback(
    (path: string) => {
      const doc = docsByPath?.[path];
      if (isFileData(doc)) {
        const contentType = doc.contentType || doc.fileType?.toLowerCase();
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
      }
      return undefined;
    },
    [docsByPath]
  );
  const getRowColor = useCallback(
    (path: string) => {
      const doc = docsByPath?.[path];
      if (isFileData(doc)) {
        const contentType = doc.contentType || doc.fileType?.toLowerCase();
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
      }
      return "";
    },
    [docsByPath]
  );
  const getRowMoreOptions = useCallback(
    (path: string) => {
      const doc = docsByPath?.[path];
      if (isFileData(doc)) {
        return ["Replace", "Move", "---", "Delete"];
      }
      return ["Rename", "---", "Delete"];
    },
    [docsByPath]
  );
  const getOptionIcon = useCallback((option: string) => {
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
  const isOptionUpload = useCallback((option: string): boolean => {
    if (option === "Replace") {
      return true;
    }
    return false;
  }, []);
  const isOptionDisabled = useCallback(
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
      const id = idsByPath?.[path];
      if (isFileData(doc)) {
        const { storageKey } = doc;
        if (storageKey) {
          try {
            onDelete(path);
            const Storage = (
              await import("../../../impower-storage/classes/storage")
            ).default;
            await Storage.instance.delete(storageKey);
          } catch (error) {
            toastDispatch(toastTop(error.message, "error"));
            const logError = (
              await import("../../../impower-logger/utils/logError")
            ).default;
            logError("Storage", error);
          }
        }
      }
      if (isFolderData(doc)) {
        try {
          onDelete(
            getDataStatePath(
              "projects",
              projectId,
              "instances",
              "folders",
              "data",
              id
            )
          );
        } catch (error) {
          toastDispatch(toastTop(error.message, "error"));
          const logError = (
            await import("../../../impower-logger/utils/logError")
          ).default;
          logError("Storage", error);
        }
      }
    },
    [docsByPath, idsByPath, onDelete, projectId, toastDispatch]
  );

  const handleDelete = useCallback(
    async (paths: string[]): Promise<void> => {
      const nestedDeletedPaths = paths.flatMap(
        (deletedPath) => pathsByFolder[deletedPath] || [deletedPath]
      );
      await Promise.all(
        nestedDeletedPaths.map((path) => handleDeleteFile(path))
      );
    },
    [handleDeleteFile, pathsByFolder]
  );

  const handleUploadFile = useCallback(
    async (
      path: string,
      replacing: boolean,
      fileInfo: {
        file: File;
        fileId: string;
        filePath: string;
        fileName: string;
        fileType: FileContentType;
        fileExtension: FileExtension;
        newDoc: FileData;
      }
    ): Promise<void> => {
      const { file, filePath, fileName, fileType, fileExtension, newDoc } =
        fileInfo;
      try {
        const Storage = (
          await import("../../../impower-storage/classes/storage")
        ).default;
        await Storage.instance.put(
          file,
          {
            contentType: getFileContentType(fileExtension),
            customMetadata: {
              fileType,
              fileExtension,
              fileName,
            },
          },
          (snapshot) => {
            if (onUploadProgress) {
              onUploadProgress(
                filePath,
                snapshot.bytesTransferred,
                snapshot.totalBytes
              );
            }
          },
          (storageKey) => {
            onUploadStart(path, { ...newDoc, storageKey });
          }
        );
        await new Promise((resolve) => {
          // Wait a second for upload
          window.setTimeout(resolve, 1000);
        });
      } catch (error) {
        toastDispatch(toastTop(error.message, "error"));
        const logError = (
          await import("../../../impower-logger/utils/logError")
        ).default;
        logError("Storage", error);
      }
    },
    [onUploadProgress, onUploadStart, toastDispatch]
  );

  const handleUpload = useCallback(
    async (files: FileList, path: string, replacing?: boolean) => {
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
      const fileInfos = filesArray.map((file) => {
        const fileId =
          !path || path.endsWith("/") ? getUuid() : idsByPath[path];
        const filePath =
          !path || path.endsWith("/") ? `${path || ""}${fileId}` : path;
        const lastDotIndex = file.name.lastIndexOf(".");
        const ext = file.name.substring(lastDotIndex + 1) as FileExtension;
        const contentType = getFileContentType(ext);
        const currentDoc: FileData = docsByPath?.[filePath] as FileData;
        const fileName = currentDoc?.fileName || file.name;
        const fileType = contentType;
        const fileExtension = ext;
        const newDoc = createFileData({
          fileType,
          fileExtension,
          fileName,
          size: file.size,
        });
        return {
          file,
          fileId,
          filePath,
          fileName,
          fileType,
          fileExtension,
          currentDoc,
          newDoc,
        };
      });
      await Promise.all(
        fileInfos.map((fileInfo) => handleUploadFile(path, replacing, fileInfo))
      );
    },
    [toastDispatch, idsByPath, docsByPath, handleUploadFile]
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
        handleUpload(inputEvent?.target?.files, path, false);
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
          handleUpload(inputEvent.target.files, path, true);
        }
      }
      if (option === "Delete") {
        handleDelete([path]);
      }
    },
    [handleDelete, handleUpload]
  );

  const getCellDisplayValue = useCallback(
    (path: string, key: string): string => {
      const doc = docsByPath?.[path];
      if (isFileData(doc)) {
        if (key === "name") {
          return doc.name || doc.fileName;
        }
        if (key === "type") {
          return doc.contentType || doc.fileType?.toLowerCase();
        }
        if (key === "size") {
          return getFileSizeDisplayValue(doc.size || 0) || "";
        }
        if (key === "modified") {
          if (doc.updated) {
            const updated =
              typeof doc?.updated === "string"
                ? new Date(doc?.updated)
                : new Date();
            return format("Modified {date}", {
              date: abbreviateAge(updated),
            });
          }
          return "";
        }
        return String(doc[key]);
      }
      if (isFolderData(doc)) {
        if (key === "name") {
          return doc.name;
        }
        if (key === "type") {
          return "folder";
        }
        if (key === "size") {
          return getFileSizeDisplayValue(doc.size) || "";
        }
        return String(doc[key]);
      }
      return "";
    },
    [docsByPath]
  );
  const getCellSortValue = useCallback(
    (path: string, key: string): string | number => {
      const doc = docsByPath?.[path];
      if (isFileData(doc)) {
        if (key === "size") {
          return doc.size;
        }
        if (key === "modified") {
          if (doc.updated) {
            const updated =
              typeof doc?.updated === "string"
                ? new Date(doc?.updated)
                : new Date();
            return updated.toJSON();
          }
        }
      }
      if (isFolderData(doc)) {
        if (key === "name") {
          return doc.name;
        }
        if (key === "type") {
          return "folder";
        }
        if (key === "size") {
          return doc.size;
        }
        return String(doc[key]);
      }
      return getCellDisplayValue(path, key);
    },
    [docsByPath, getCellDisplayValue]
  );

  const handleIsUploadAllowed = useCallback((): boolean => {
    return true;
  }, []);

  const handleIsContextAllowed = useCallback((): boolean => {
    return true;
  }, []);

  const contextOptions = useMemo(
    () => [moveLabel, "---", deleteLabel],
    [moveLabel, deleteLabel]
  );

  return (
    <>
      <EngineConsoleList
        scrollParent={scrollParent}
        loading={loading}
        paths={paths}
        cardDetails={cardDetails}
        rowNameKey="name"
        getUploadLabel={getUploadLabel}
        getRowImage={getRowImage}
        getRowIcon={getRowIcon}
        getRowColor={getRowColor}
        getRowMoreOptions={getRowMoreOptions}
        getOptionIcon={getOptionIcon}
        isOptionUpload={isOptionUpload}
        isOptionDisabled={isOptionDisabled}
        getCellDisplayValue={getCellDisplayValue}
        getCellSortValue={getCellSortValue}
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
        uploadProgress={uploadProgress}
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
        stickyOffset={stickyOffset}
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
  folderDocs: { [id: string]: FolderData };
  selectedColor?: string;
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
  headerStyle?: React.CSSProperties;
  leftStyle?: React.CSSProperties;
  moreButtonStyle?: React.CSSProperties;
  searchButtonStyle?: React.CSSProperties;
  dividerStyle?: React.CSSProperties;
  paperStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  sticky?: "always" | "collapsible" | "never";
  stickyOffset?: number;
}

const FilesConsole = (props: FilesConsoleProps): JSX.Element => {
  const {
    scrollParent,
    projectDoc,
    projectId,
    fileDocs,
    folderDocs,
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
    stickyOffset,
  } = props;

  const studioId = projectDoc.studio;

  const [, dispatch] = useContext(ProjectEngineContext);

  const uploadProgressRef = useRef<{
    [path: string]: {
      bytesTransferred: number;
      totalBytes: number;
      newDoc: FileData;
    };
  }>({});
  const [uploadProgress, setUploadProgress] = useState<{
    [path: string]: { bytesTransferred: number; totalBytes: number };
  }>({});

  const [editDialogOpen, setEditDialogOpen] = useState<boolean>();
  const [dialogScrollElement, setDialogScrollElement] = useState<HTMLElement>();
  const [editIndex, setEditIndex] = useState<number>();

  const docsByPathRef = useRef<{
    [path: string]: FileData | FolderData;
  }>({});
  const [docsByPath, setDocsByPath] = useState<{
    [path: string]: FileData | FolderData;
  }>();
  const idsByPathRef = useRef<{
    [path: string]: string;
  }>({});
  const [idsByPath, setIdsByPath] = useState<{
    [path: string]: string;
  }>({});
  const [pathsByFolder, setPathsByFolder] = useState<{
    [path: string]: string[];
  }>({});
  const [visibleOrderedPaths, setVisibleOrderedPaths] = useState<string[]>();

  const [currentPath, setCurrentPath] = useState<string>("/");

  const editDocPath = visibleOrderedPaths?.[editIndex];
  const editDocId = idsByPath?.[editDocPath];
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
      const idsByPath = {};
      const docsByPath = {};
      const pathsByFolder = {};
      // Object.entries(folderDocs).forEach(([id, doc]) => {
      //   const folderPath = doc.path;
      //   const path = folderPath.split("/").reduce((prev, curr) => {
      //     const partName = curr ? folderDocs[curr].name : curr;
      //     return `${prev}${partName}/`;
      //   });
      //   idsByPath[path] = id;
      //   docsByPath[path] = doc;
      //   if (!pathsByFolder[path]) {
      //     pathsByFolder[path] = [];
      //   }
      //   pathsByFolder[path].push(path);
      // });
      Object.entries(fileDocs).forEach(([id, doc]) => {
        const path = `/${id}`;
        idsByPath[path] = id;
        docsByPath[path] = doc;
      });
      const currentUploadingProgress = { ...uploadProgressRef.current };
      Object.keys(currentUploadingProgress).forEach((path) => {
        if (docsByPath[path]) {
          delete uploadProgressRef.current[path];
        } else {
          docsByPath[path] = uploadProgressRef.current[path].newDoc;
        }
      });
      setUploadProgress({ ...uploadProgressRef.current });
      setIdsByPath(idsByPath);
      setDocsByPath(docsByPath);
      setPathsByFolder(pathsByFolder);
    } else {
      setDocsByPath(undefined);
    }
  }, [fileDocs, folderDocs]);

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
      const doc = docsByPath?.[path];
      if (isFileData(doc)) {
        setEditIndex(visibleOrderedPaths.indexOf(path));
        setEditDialogOpen(true);
        openEditDialog("file");
      }
    },
    [docsByPath, visibleOrderedPaths, openEditDialog]
  );
  const handleUploadStart = useCallback((path: string, newDoc: FileData) => {
    uploadProgressRef.current[path] = {
      bytesTransferred: 0,
      totalBytes: newDoc.size,
      newDoc,
    };
    docsByPathRef.current[path] = newDoc;
    setUploadProgress({ ...uploadProgressRef.current });
    setDocsByPath({ ...docsByPathRef.current });
  }, []);
  const handleUploadProgress = useCallback(
    (filePath: string, bytesTransferred: number, totalBytes: number) => {
      uploadProgressRef.current[filePath] = {
        ...uploadProgressRef.current[filePath],
        bytesTransferred,
        totalBytes,
      };
      setUploadProgress({ ...uploadProgressRef.current });
    },
    []
  );
  const handleDelete = useCallback((path: string) => {
    if (docsByPathRef.current[path]) {
      const newDocsByPath = { ...docsByPathRef.current };
      delete newDocsByPath[path];
      setDocsByPath(newDocsByPath);
    }
    if (idsByPathRef.current[path]) {
      const newIdsByPath = { ...idsByPathRef.current };
      delete newIdsByPath[path];
      setIdsByPath(newIdsByPath);
    }
  }, []);
  const handleReorder = useCallback((paths: string[]) => {
    setVisibleOrderedPaths(paths);
  }, []);

  const handleChangeEditDoc = useCallback(
    async (doc: FileData) => {
      dispatch(
        projectChangeInstanceData(projectId, "modified", {
          [editDocId]: doc,
        })
      );
    },
    [dispatch, editDocId, projectId]
  );

  const handleCloseEditDialog = useCallback(() => {
    setEditDialogOpen(false);
    closeEditDialog();
  }, [closeEditDialog]);

  const handleDialogRef = useCallback((element: HTMLElement) => {
    if (element) {
      setDialogScrollElement(
        element.querySelector(".MuiDialog-scrollPaper")
          .firstElementChild as HTMLElement
      );
    }
  }, []);

  const handlePrevious = useCallback(() => {
    setEditIndex(editIndex - 1);
  }, [editIndex]);

  const handleNext = useCallback(() => {
    setEditIndex(editIndex + 1);
  }, [editIndex]);

  return (
    <>
      <StyledConsoleContentArea>
        <FilesConsoleContent
          studioId={studioId}
          scrollParent={scrollParent}
          projectId={projectId}
          cardDetails={cardDetails}
          currentPath={currentPath}
          idsByPath={idsByPath}
          docsByPath={docsByPath}
          pathsByFolder={pathsByFolder}
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
          loading={!docsByPath}
          uploadProgress={uploadProgress}
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
          stickyOffset={stickyOffset}
          onChangeCurrentPath={setCurrentPath}
          onClick={handleClick}
          onUploadStart={handleUploadStart}
          onUploadProgress={handleUploadProgress}
          onDelete={handleDelete}
          onReorder={handleReorder}
        />
      </StyledConsoleContentArea>
      <EditDialog
        ref={handleDialogRef}
        open={editDialogOpen}
        fullScreen
        onClose={handleCloseEditDialog}
      >
        {isFileData(editDoc) && (
          <EditFileForm
            scrollParent={dialogScrollElement}
            docId={editDocId}
            doc={editDoc}
            onClose={handleCloseEditDialog}
            onChange={handleChangeEditDoc}
          />
        )}
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
              disabled={editIndex === visibleOrderedPaths?.length - 1}
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
