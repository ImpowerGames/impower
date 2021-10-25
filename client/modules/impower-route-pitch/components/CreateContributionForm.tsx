import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import FilledInput from "@material-ui/core/FilledInput";
import FormHelperText from "@material-ui/core/FormHelperText";
import IconButton from "@material-ui/core/IconButton";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CropSimpleSolidIcon from "../../../resources/icons/solid/crop-simple.svg";
import ImageSolidIcon from "../../../resources/icons/solid/image.svg";
import VolumeHighSolidIcon from "../../../resources/icons/solid/volume-high.svg";
import XmarkSolidIcon from "../../../resources/icons/solid/xmark.svg";
import ConfigCache from "../../impower-config/classes/configCache";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../impower-confirm-dialog";
import {
  FileExtension,
  FileType,
  getFileContentType,
} from "../../impower-core";
import {
  ContributionDocument,
  ContributionType,
  isProjectDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import { FontIcon } from "../../impower-icon";
import { DynamicLoadingButton, TextField } from "../../impower-route";
import HelpButton from "../../impower-route/components/elements/HelpButton";
import AspectRatioBox from "../../impower-route/components/inputs/AspectRatioBox";
import AudioPreview from "../../impower-route/components/inputs/AudioPreview";
import CropDialog from "../../impower-route/components/inputs/CropDialog";
import { GameSummaryPreambleSelector } from "../../impower-route/components/inputs/GameSummaryPreambleSelector";
import ImagePreview from "../../impower-route/components/inputs/ImagePreview";
import Fallback from "../../impower-route/components/layouts/Fallback";
import useIOS from "../../impower-route/hooks/useIOS";
import useVisualViewport from "../../impower-route/hooks/useVisualViewport";
import { getFileSizeLimit } from "../../impower-storage";
import { ToastContext, toastTop } from "../../impower-toast";
import {
  UserContext,
  userOnCreateSubmission,
  userOnUpdateSubmission,
} from "../../impower-user";
import { getPreviewAspectRatio } from "../utils/getPreviewAspectRatio";
import { getPreviewInnerStyle } from "../utils/getPreviewInnerStyle";
import { getTruncatedContent } from "../utils/getTruncatedContent";

const InfoHelp = dynamic(
  () => import("../../impower-route/components/elements/InfoHelp"),
  { ssr: false }
);

const discardInfo = {
  title: "Discard unsaved changes?",
  agreeLabel: "Discard",
  disagreeLabel: "Keep Editing",
};

const editWarningInfo = {
  title: "Editing a contribution will reset its score",
  agreeLabel: "Edit And Reset",
  disagreeLabel: "Cancel",
};

const StyledContainer = styled.div`
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledHeader = styled.div`
  min-height: ${(props): string => props.theme.spacing(7)};
  z-index: 1;
`;

const StyledHeaderContent = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  min-height: ${(props): string => props.theme.spacing(7)};
`;

const StyledHeaderContainer = styled.div`
  width: 100%;
  margin: auto;
  max-width: ${(props): number => props.theme.breakpoints.values.sm}px;
  display: flex;
  align-items: center;
  position: relative;
  padding: ${(props): string => props.theme.spacing(0, 1)};
  background-color: white;
  box-shadow: ${(props): string => props.theme.shadows[2]};
`;

const StyledHeaderTextArea = styled.div`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

const StyledHeaderTypography = styled(Typography)<{ component?: string }>``;

const StyledIconButton = styled(IconButton)`
  padding: ${(props): string => props.theme.spacing(2)};
  @media (hover: hover) and (pointer: fine) {
    &.MuiIconButton-root:hover {
      background-color: ${(props): string => props.theme.colors.black10};
    }
  }
`;

const StyledSubmitButtonArea = styled.div`
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: flex-end;
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledSubmitButton = styled(DynamicLoadingButton)`
  border-radius: ${(props): string => props.theme.spacing(10)};
`;

const StyledPreviewArea = styled.div`
  position: relative;
  margin-top: ${(props): string => props.theme.spacing(2)};
  margin-left: ${(props): string => props.theme.spacing(-3)};
  margin-right: ${(props): string => props.theme.spacing(-3)};
`;

const StyledPreviewButton = styled(Button)`
  padding: 0;
  width: 100%;
  position: relative;
  min-width: 0;
  min-height: 0;
  border-radius: 0;
`;

const StyledAttachmentArea = styled.div`
  border-top: 1px solid ${(props): string => props.theme.palette.secondary.main};
`;

const StyledFileInputButton = styled(Button)``;

const StyledFileInput = styled.input`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 100%;
  min-height: 100%;
  display: none;
`;

const StyledFileInputLabel = styled.label`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledIconArea = styled.label`
  padding-right: ${(props): string => props.theme.spacing(1)};
`;

const StyledTextInputArea = styled.div`
  position: relative;
  min-height: ${(props): string => props.theme.spacing(7)};
`;

const StyledTextInputContent = styled.div`
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  overflow: hidden;

  & .MuiFormControl-root {
    position: inherit;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    overflow: hidden;
    display: block;
  }

  & .MuiInputBase-multiline {
    position: static;
    min-height: 100%;
    max-height: 100%;
    overflow: auto;
    display: block;
    touch-action: pan-y;
    overscroll-behavior: contain;
  }

  & .MuiInputBase-multiline * {
    touch-action: pan-y;
    overscroll-behavior: contain;
  }
`;

const StyledViewportArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledTextField = styled(TextField)`
  & .MuiInputBase-root {
    border-radius: 0;
    flex: 1;
    padding-top: 19px;
    padding-bottom: 19px;
    padding-left: 24px;
    padding-right: 24px;
  }

  & .MuiInputBase-root input {
    padding-top: 0;
    padding-bottom: 0;
    height: 100%;
  }

  & .MuiInputBase-root textarea {
    padding-top: 0;
    padding-bottom: 0;
    height: 100%;
  }

  & .MuiFormHelperText-root.Mui-error {
    color: ${(props): string => props.theme.palette.error.light};
  }

  & .MuiFilledInput-underline:before {
    border-bottom: 1px solid white;
  }

  & .MuiFilledInput-underline:hover:before {
    border-bottom: 1px solid white;
  }
`;

const StyledFormArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
`;

const StyledRelativeArea = styled.div`
  position: relative;
`;

const StyledForceOverflowSpacer = styled.div`
  pointer-events: none;

  position: absolute;
  top: 0;
  left: 0;
  right: 0;
`;

const StyledFormHelperText = styled(FormHelperText)<{ component?: string }>`
  display: flex;
  justify-content: flex-end;
  margin: 0;
  padding: ${(props): string => props.theme.spacing(1, 1)};
  border-top: 1px solid ${(props): string =>
    props.theme.palette.secondary.main};
  
  &.error .LeftHelperTextTypography {
    animation: shake 0.4s 1 linear;
    backface-visibility: hidden;
    perspective: 1000px;
  }

  &.limit .RightHelperTextTypography {
    animation: shake 0.4s 1 linear;
    backface-visibility: hidden;
    perspective: 1000px;
  }

  @keyframes shake {
    0% {
      color: ${(props): string => props.theme.palette.error.main};
      transform: translate(8px);
    }
    20% {
      transform: translate(-8px);
    }
    40% {
      transform: translate(8px);
    }
    60% {
      transform: translate(-8px);
    }
    80% {
      transform: translate(8px);
    }
    90% {
      color: ${(props): string => props.theme.palette.error.main};
      transform: translate(-4px);
    }
    100% {
      color: inherit;
      transform: translate(0px);
    }
`;

const LeftHelperTextTypography = styled.p`
  margin: 0;
  text-align: left;
  flex: 1;
  padding-left: ${(props): string => props.theme.spacing(1)};
  padding-right: ${(props): string => props.theme.spacing(1)};
`;

const RightHelperTextTypography = styled.p`
  margin: 0;
  text-align: right;
`;

const StyledCropIcon = styled.div`
  position: absolute;
  bottom: ${(props): string => props.theme.spacing(1)};
  right: ${(props): string => props.theme.spacing(1)};
  padding: ${(props): string => props.theme.spacing(1)};
  border-radius: 50%;
  color: white;
  min-width: 0;
  min-height: 0;
  background-color: ${(props): string => props.theme.colors.black60};
  @media (hover: none) {
    &.MuiButton-contained:hover {
      background-color: ${(props): string => props.theme.colors.black60};
    }
  }
`;

const StyledRelativeTruncationArea = styled.div`
  position: relative;
  z-index: 1;
`;

const StyledTruncationPreview = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  height: fit-content;
  font-family: ${(props): string => props.theme.fontFamily.monospace};
  line-height: 1.5;
  pointer-events: none;
  color: ${(props): string => props.theme.palette.secondary.light};
  white-space: pre-wrap;
`;

const StyledMark = styled.mark`
  background-color: transparent;
  color: inherit;
  font-weight: 700;
  padding-left: 1px;
`;

const requestTimeout = (call: () => unknown, delay: number): number => {
  const start = new Date().getTime();
  const loop = (): void => {
    const current = new Date().getTime();
    if (current - start >= delay) {
      call();
    } else {
      window.requestAnimationFrame(loop);
    }
  };
  return window.requestAnimationFrame(loop);
};

const getFileType = (contributionType: ContributionType): FileType =>
  contributionType === "story" || contributionType === "pitch"
    ? "text/*"
    : contributionType === "image"
    ? "image/*"
    : contributionType === "audio"
    ? "audio/*"
    : undefined;

interface CreateContributionFormProps {
  pitchId: string;
  pitchDoc: ProjectDocument | ContributionDocument;
  editing?: boolean;
  doc?: ContributionDocument;
  file?: globalThis.File;
  onClose?: (e: React.MouseEvent) => void;
  onSubmit?: (
    e: React.MouseEvent,
    id: string,
    doc: ContributionDocument
  ) => void;
  onUnsavedChange?: (hasUnsavedChanges: boolean) => void;
}

const CreateContributionForm = React.memo(
  (props: CreateContributionFormProps): JSX.Element => {
    const pitchedCollection = "pitched_games";

    const {
      pitchId,
      pitchDoc,
      editing,
      doc,
      file,
      onClose,
      onSubmit,
      onUnsavedChange,
    } = props;

    const theme = useTheme();
    const maxWidth = theme.breakpoints.values.sm;

    const [userState, userDispatch] = useContext(UserContext);
    const { uid } = userState;

    const [viewportArea, setViewportArea] = useState<HTMLDivElement>();
    const submittingRef = useRef(false);
    const [submitting, setSubmitting] = useState(submittingRef.current);
    const [cropDialogOpen, setCropDialogOpen] = useState(false);

    const type = doc?.contributionType || "story";
    const newContributionId = `${uid}-${type?.toLowerCase()}`;

    const [tagsState, setTagsState] = useState(
      isProjectDocument(pitchDoc) ? pitchDoc?.tags : undefined
    );
    const [contentState, setContentState] = useState(doc?.content || "");
    const [fileState, setFileState] = useState(file);
    const [fileUrlState, setFileUrlState] = useState(doc?.file?.fileUrl || "");
    const [backgroundHexState, setBackgroundHexState] = useState(
      doc?.backgroundHex
    );
    const [waveformState, setWaveformState] = useState(doc?.waveform);
    const [aspectRatioState, setAspectRatioState] = useState(
      doc?.aspectRatio !== undefined ? doc?.aspectRatio : 1
    );
    const [squareState, setSquareState] = useState(
      doc?.square !== undefined ? doc?.square : true
    );
    const [cropState, setCropState] = useState(
      doc?.crop !== undefined ? doc?.crop : 0.5
    );
    const [limitAnimation, setLimitAnimation] = useState(false);

    const stateRef = useRef(contentState);
    const savedRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>();

    const variant = "filled";
    const InputComponent = FilledInput;
    const size = "medium";

    const authenticated = uid !== undefined ? Boolean(uid) : undefined;

    const visualViewportSupported = useVisualViewport(viewportArea);
    const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
    const [, toastDispatch] = useContext(ToastContext);
    const ios = useIOS();

    const hasUnsavedChanges =
      type === "story" || type === "pitch"
        ? contentState && contentState !== doc?.content
        : type === "image" || type === "audio"
        ? (fileUrlState && fileUrlState !== doc?.file?.fileUrl) ||
          (contentState && contentState !== doc?.content)
        : false;

    const placeholder =
      type === "story"
        ? `Write a short story or dialog inspired by this idea...`
        : type === "image"
        ? `Describe what you made...`
        : type === "audio"
        ? `Describe what you made...`
        : "";

    const fileType = getFileType(type);

    const keyboardSpacerStyle = useMemo(
      () => ({
        height: ios && !visualViewportSupported ? "50vh" : 0,
      }),
      [ios, visualViewportSupported]
    );

    const characterCountLimit = type === "story" ? 10000 : 300;
    const truncationLimit = 300;
    const truncatedContent = getTruncatedContent(contentState, truncationLimit);
    const showTruncationPreview =
      type === "story" && contentState.length > truncationLimit;

    const helperText = useMemo(
      () =>
        showTruncationPreview ? (
          <HelpButton
            id={`create-contribution-dialog`}
            fontSize={theme.typography.caption.fontSize}
            label={`'Read More' break will be placed at ⋮`}
            style={{ pointerEvents: "auto" }}
          >
            <InfoHelp
              title={`The 'Read More' break`}
              description={`The 'Read More' break is where your story will be truncated when viewing it from a pitch's contribution list. It is automatically placed at the first blank line or last space before ${truncationLimit} characters.`}
              caption={`Make sure to include an interesting excerpt or summary above this break!`}
              alignment="center"
            />
          </HelpButton>
        ) : undefined,
      [showTruncationPreview, theme.typography.caption.fontSize]
    );

    const counterText = `${
      String(contentState).length
    } / ${characterCountLimit}`;

    useEffect(() => {
      if (onUnsavedChange) {
        onUnsavedChange(hasUnsavedChanges);
      }
    }, [hasUnsavedChanges, onUnsavedChange]);

    useEffect(() => {
      savedRef.current = false;
    }, [hasUnsavedChanges]);

    useEffect(() => {
      setTagsState(isProjectDocument(pitchDoc) ? pitchDoc?.tags : undefined);
    }, [pitchDoc]);

    useEffect(() => {
      if (doc?.content !== undefined) {
        setContentState(doc?.content);
      }
    }, [doc?.content]);

    useEffect(() => {
      if (doc?.backgroundHex !== undefined) {
        setBackgroundHexState(doc?.backgroundHex);
      }
    }, [doc?.backgroundHex]);

    useEffect(() => {
      if (doc?.waveform !== undefined) {
        setWaveformState(doc?.waveform);
      }
    }, [doc?.waveform]);

    useEffect(() => {
      if (doc?.aspectRatio !== undefined) {
        setAspectRatioState(doc?.aspectRatio);
      }
    }, [doc?.aspectRatio]);

    useEffect(() => {
      if (doc?.square !== undefined) {
        setSquareState(doc?.square);
      }
    }, [doc?.square]);

    useEffect(() => {
      if (doc?.crop !== undefined) {
        setCropState(doc?.crop);
      }
    }, [doc?.crop]);

    useEffect(() => {
      setFileState(file);
    }, [file]);

    useEffect(() => {
      if (fileState) {
        const setup = async (): Promise<void> => {
          const fileUrl = URL.createObjectURL(fileState);
          if (fileUrl && type === "image") {
            const FastAverageColor = (await import("fast-average-color"))
              .default;
            const fac = new FastAverageColor();
            const { hex } = await fac.getColorAsync(fileUrl, {
              ignoredColor: [255, 255, 255, 255], // white
            });
            const getReadableBackgroundColorHex = (
              await import(
                "../../impower-core/utils/getReadableBackgroundColorHex"
              )
            ).default;
            const backgroundHex = getReadableBackgroundColorHex(
              theme.colors.like,
              hex
            );
            const img = new Image();
            img.src = fileUrl;
            const aspectRatio: number = await new Promise((resolve) => {
              img.onload = (): void => {
                resolve(img.width / img.height);
              };
            });
            setBackgroundHexState(backgroundHex);
            setAspectRatioState(aspectRatio);
          }
          setFileUrlState(fileUrl);
        };
        setup();
      }
    }, [fileState, theme.colors.like, type]);

    // If changes are not saved show an "Unsaved Changes" warning popup when navigating away from website
    useEffect(() => {
      const onBeforeUnload = (event): void => {
        if (hasUnsavedChanges && !savedRef.current && !submittingRef.current) {
          event.preventDefault();
          event.returnValue = true;
        }
      };
      window.addEventListener("beforeunload", onBeforeUnload);
      return (): void => {
        window.removeEventListener("beforeunload", onBeforeUnload);
      };
    }, [hasUnsavedChanges]);

    const handleOutsideClick = useCallback((e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      window.requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      });
    }, []);

    const [openAccountDialog] = useDialogNavigation("a");

    const handlePost = useCallback(
      async (e: React.MouseEvent): Promise<void> => {
        if (!authenticated) {
          openAccountDialog("signup");
          return;
        }
        submittingRef.current = true;
        setSubmitting(submittingRef.current);
        if (inputRef.current) {
          inputRef.current.blur();
        }
        const Auth = (await import("../../impower-auth/classes/auth")).default;
        const createContributionDocument = (
          await import(
            "../../impower-data-store/utils/createContributionDocument"
          )
        ).default;
        const newDoc = createContributionDocument({
          ...(doc || {}),
          _createdBy: uid,
          _author: Auth.instance.author,
          content: contentState,
          contributionType: type,
        });
        newDoc.tags = type === "pitch" ? tagsState.slice(0, 1) : [];
        if (backgroundHexState) {
          newDoc.backgroundHex = backgroundHexState;
        }
        if (waveformState) {
          newDoc.waveform = waveformState;
        }
        if (fileState) {
          const Storage = (
            await import("../../impower-storage/classes/storage")
          ).default;
          const lastDotIndex = fileState.name.lastIndexOf(".");
          const fileExtension = fileState.name.substring(
            lastDotIndex + 1
          ) as FileExtension;
          if (doc?.file?.storageKey) {
            await Storage.instance.delete(doc?.file?.storageKey);
          }
          const customMetadata = {
            fileType,
            fileExtension,
            fileName: fileState.name,
          };
          const fileUrl = await Storage.instance.put(fileState, {
            contentType: getFileContentType(fileExtension),
            customMetadata,
          });
          newDoc.file = {
            ...customMetadata,
            fileUrl,
          };
          newDoc.square = squareState;
          newDoc.crop = cropState;
          if (fileType === "image/*") {
            const FastAverageColor = (await import("fast-average-color"))
              .default;
            const fac = new FastAverageColor();
            const { hex } = await fac.getColorAsync(fileUrl, {
              ignoredColor: [255, 255, 255, 255], // white
            });
            const getReadableBackgroundColorHex = (
              await import(
                "../../impower-core/utils/getReadableBackgroundColorHex"
              )
            ).default;
            newDoc.backgroundHex = getReadableBackgroundColorHex(
              theme.colors.like,
              hex
            );
            const img = new Image();
            img.src = fileUrl;
            newDoc.aspectRatio = await new Promise((resolve) => {
              img.onload = (): void => {
                resolve(img.width / img.height);
              };
            });
          }
        }
        const contributionId = newContributionId;
        if (editing || newDoc.delisted) {
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnUpdateSubmission(
                resolve,
                { ...newDoc, delisted: false },
                pitchedCollection,
                pitchId,
                "contributions",
                contributionId
              )
            )
          );
        } else {
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnCreateSubmission(
                resolve,
                newDoc,
                pitchedCollection,
                pitchId,
                "contributions",
                contributionId
              )
            )
          );
        }
        savedRef.current = true;
        if (onSubmit) {
          onSubmit(e, contributionId, newDoc);
        }
        if (onUnsavedChange) {
          onUnsavedChange(false);
        }
        if (onClose) {
          onClose(e);
        }
        submittingRef.current = false;
        setSubmitting(submittingRef.current);
      },
      [
        authenticated,
        doc,
        uid,
        contentState,
        type,
        backgroundHexState,
        waveformState,
        fileState,
        newContributionId,
        editing,
        onSubmit,
        onUnsavedChange,
        onClose,
        openAccountDialog,
        fileType,
        squareState,
        cropState,
        tagsState,
        theme.colors.like,
        userDispatch,
        pitchId,
      ]
    );

    const handleSubmit = useCallback(
      async (e: React.MouseEvent): Promise<void> => {
        const onPost = (): void => {
          handlePost(e);
        };
        if (editing && hasUnsavedChanges) {
          confirmDialogDispatch(
            confirmDialogNavOpen(
              editWarningInfo.title,
              undefined,
              editWarningInfo.agreeLabel,
              onPost,
              editWarningInfo.disagreeLabel,
              undefined,
              { disableAutoFocus: !ios, disableEnforceFocus: !ios }
            )
          );
        } else {
          onPost();
        }
      },
      [editing, hasUnsavedChanges, handlePost, confirmDialogDispatch, ios]
    );

    const handleClose = useCallback(
      (e: React.MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        if (submittingRef.current) {
          return;
        }
        const doClose = (): void => {
          if (inputRef.current) {
            inputRef.current.blur();
          }
          if (ios) {
            if (onClose) {
              onClose(e);
            }
          } else {
            // Wait for keyboard to collapse
            requestTimeout(() => {
              if (onClose) {
                onClose(e);
              }
            }, 300);
          }
        };
        const onDiscardChanges = (): void => {
          if (onUnsavedChange) {
            onUnsavedChange(false);
          }
          doClose();
        };
        if (hasUnsavedChanges) {
          confirmDialogDispatch(
            confirmDialogNavOpen(
              discardInfo.title,
              undefined,
              discardInfo.agreeLabel,
              onDiscardChanges,
              discardInfo.disagreeLabel,
              undefined,
              { disableAutoFocus: !ios, disableEnforceFocus: !ios }
            )
          );
        } else {
          onDiscardChanges();
        }
      },
      [confirmDialogDispatch, hasUnsavedChanges, ios, onClose, onUnsavedChange]
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        stateRef.current = newValue;
        setContentState(newValue);
      },
      []
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (
          e.key !== "Backspace" &&
          stateRef.current.length >= characterCountLimit
        ) {
          setLimitAnimation(true);
          setTimeout(() => {
            setLimitAnimation(false);
          }, 1000);
        } else {
          setLimitAnimation(false);
        }
      },
      [characterCountLimit]
    );

    const handleViewportAreaRef = useCallback(
      (instance: HTMLDivElement): void => {
        if (instance) {
          setViewportArea(instance);
        }
      },
      []
    );

    const handleInputRef = useCallback(
      (instance: HTMLInputElement): void => {
        inputRef.current = instance;
        if (type === "story" || type === "pitch") {
          window.requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          });
        }
      },
      [type]
    );

    const handleOpenCropDialog = useCallback(() => {
      setCropDialogOpen(true);
    }, []);

    const handleCloseCropDialog = useCallback(() => {
      setCropDialogOpen(false);
    }, []);

    const handleCrop = useCallback((value: number) => {
      setCropState(value);
    }, []);

    const fullHeight = !ios || visualViewportSupported;

    const inputTopPadding = 19;
    const headerHeight = 56;
    const fileInputButtonHeight = type === "image" || type === "audio" ? 48 : 0;
    const footerHeight = fileInputButtonHeight;

    const imagePreviewStyle: React.CSSProperties = useMemo(
      () => ({ height: "100%" }),
      []
    );
    const previewAspectRatio = getPreviewAspectRatio(
      aspectRatioState,
      squareState
    );
    const previewInnerStyle: React.CSSProperties = useMemo(
      () => getPreviewInnerStyle(aspectRatioState, squareState, cropState),
      [aspectRatioState, cropState, squareState]
    );

    const forceOverflowStyle = useMemo(
      () => ({
        minHeight: `calc(100vh - ${inputTopPadding}px - ${headerHeight}px - ${footerHeight}px + 1px)`,
      }),
      [footerHeight]
    );

    const storyStyle: React.CSSProperties = useMemo(
      () => ({
        fontFamily: type === "story" ? theme.fontFamily.monospace : undefined,
        lineHeight: 1.5,
      }),
      [theme.fontFamily.monospace, type]
    );

    const InputProps = useMemo(
      () => ({
        style: {
          backgroundColor: "white",
          ...storyStyle,
        },
        startAdornment: (
          <>
            {type === "pitch" && (
              <GameSummaryPreambleSelector
                placeholder={
                  ConfigCache.instance.params?.messages?.pitched_games_preamble
                }
                tags={tagsState}
                onChangeTags={setTagsState}
              />
            )}
            <StyledRelativeArea>
              {/* On IOS, forcing overflow blocks scrolling from propagating behind the opened dialog */}
              {ios && <StyledForceOverflowSpacer style={forceOverflowStyle} />}
            </StyledRelativeArea>
            {showTruncationPreview && (
              <StyledRelativeTruncationArea>
                <StyledTruncationPreview style={storyStyle}>
                  {truncatedContent}
                  <StyledMark>{`⋮`}</StyledMark>
                </StyledTruncationPreview>
              </StyledRelativeTruncationArea>
            )}
          </>
        ),
        endAdornment: (
          <>
            {fileUrlState && (
              <StyledPreviewArea>
                {type === "image" && (
                  <StyledPreviewButton
                    disableTouchRipple
                    onClick={
                      aspectRatioState !== 1 ? handleOpenCropDialog : undefined
                    }
                  >
                    <AspectRatioBox aspectRatio={previewAspectRatio}>
                      <ImagePreview
                        src={fileUrlState}
                        style={imagePreviewStyle}
                        innerStyle={previewInnerStyle}
                      >
                        {aspectRatioState !== 1 && (
                          <StyledCropIcon onClick={handleOpenCropDialog}>
                            <FontIcon aria-label={`Crop`} size={16}>
                              <CropSimpleSolidIcon />
                            </FontIcon>
                          </StyledCropIcon>
                        )}
                      </ImagePreview>
                    </AspectRatioBox>
                  </StyledPreviewButton>
                )}
                {type === "audio" && (
                  <AudioPreview
                    src={fileUrlState}
                    waveform={waveformState}
                    onWaveformReady={setWaveformState}
                    innerStyle={previewInnerStyle}
                  />
                )}
              </StyledPreviewArea>
            )}
          </>
        ),
      }),
      [
        storyStyle,
        ios,
        forceOverflowStyle,
        showTruncationPreview,
        truncatedContent,
        tagsState,
        fileUrlState,
        type,
        aspectRatioState,
        handleOpenCropDialog,
        previewAspectRatio,
        imagePreviewStyle,
        previewInnerStyle,
        waveformState,
      ]
    );

    const inputProps = useMemo(
      () => ({ maxLength: characterCountLimit }),
      [characterCountLimit]
    );

    const handleUploadFile = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const { files } = e.target;
        const file = files[0];
        if (file) {
          if (file.size > getFileSizeLimit()) {
            const error = "File size must be less than 10mb";
            toastDispatch(toastTop(error, "error"));
            return;
          }
          const fileUrl = URL.createObjectURL(file);
          setFileState(file);
          setFileUrlState(fileUrl);
        }
      },
      [toastDispatch]
    );

    const renderHelperText = useCallback(
      (props: {
        errorText?: string;
        helperText?: React.ReactNode;
        counterText: string;
      }): React.ReactNode => {
        const { errorText, helperText, counterText } = props;
        const leftHelperText = errorText || helperText;
        const rightHelperText = counterText;
        return leftHelperText || rightHelperText ? (
          <>
            {leftHelperText && (
              <LeftHelperTextTypography
                className={LeftHelperTextTypography.displayName}
              >
                {leftHelperText}
              </LeftHelperTextTypography>
            )}
            {rightHelperText && (
              <RightHelperTextTypography
                className={RightHelperTextTypography.displayName}
              >
                {rightHelperText}
              </RightHelperTextTypography>
            )}
          </>
        ) : undefined;
      },
      []
    );

    const dialogHelperText = useMemo(
      () =>
        renderHelperText
          ? renderHelperText({
              helperText,
              counterText,
            })
          : undefined,
      [counterText, helperText, renderHelperText]
    );

    const maxWidthStyle: React.CSSProperties = useMemo(
      () => ({ maxWidth }),
      [maxWidth]
    );

    const textInputAreaStyle: React.CSSProperties = useMemo(
      () => ({
        flex: fullHeight ? 1 : 0,
        maxHeight: ios && !visualViewportSupported ? "50vh" : undefined,
      }),
      [fullHeight, ios, visualViewportSupported]
    );

    const textInputContentStyle: React.CSSProperties = useMemo(
      () => ({ position: fullHeight ? "absolute" : undefined }),
      [fullHeight]
    );

    const fileInputButtonStyle: React.CSSProperties = useMemo(
      () => ({ height: fileInputButtonHeight }),
      [fileInputButtonHeight]
    );

    return (
      <>
        <StyledViewportArea ref={handleViewportAreaRef}>
          <StyledContainer style={maxWidthStyle}>
            <StyledHeader>
              <StyledHeaderContent>
                <StyledHeaderContainer style={maxWidthStyle}>
                  <StyledIconButton onClick={handleClose}>
                    <FontIcon
                      aria-label={`Close`}
                      color={theme.palette.secondary.main}
                    >
                      <XmarkSolidIcon />
                    </FontIcon>
                  </StyledIconButton>
                  <StyledHeaderTextArea>
                    <StyledHeaderTypography variant="h6" component="h2">
                      {type === "pitch"
                        ? editing
                          ? `Edit Pitch`
                          : "Pitch"
                        : type === "story"
                        ? editing
                          ? `Edit Story`
                          : "Story"
                        : type === "image"
                        ? editing
                          ? `Edit Image`
                          : "Image"
                        : type === "audio"
                        ? editing
                          ? `Edit Audio`
                          : "Audio"
                        : null}
                    </StyledHeaderTypography>
                  </StyledHeaderTextArea>
                  <StyledSubmitButtonArea>
                    <StyledSubmitButton
                      loading={submitting}
                      disabled={!hasUnsavedChanges}
                      color={hasUnsavedChanges ? "primary" : "inherit"}
                      variant="contained"
                      disableElevation
                      onClick={handleSubmit}
                    >
                      {editing ? `Submit` : `Contribute`}
                    </StyledSubmitButton>
                  </StyledSubmitButtonArea>
                </StyledHeaderContainer>
              </StyledHeaderContent>
            </StyledHeader>
            <StyledFormArea>
              <StyledTextInputArea
                onClick={handleOutsideClick}
                style={textInputAreaStyle}
              >
                <StyledTextInputContent style={textInputContentStyle}>
                  {doc === undefined ? (
                    <Fallback />
                  ) : (
                    <StyledTextField
                      inputRef={handleInputRef}
                      className={variant}
                      variant={variant}
                      InputComponent={InputComponent}
                      value={contentState}
                      size={size}
                      color="secondary"
                      placeholder={placeholder}
                      multiline
                      fullWidth
                      InputProps={InputProps}
                      inputProps={inputProps}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                    />
                  )}
                </StyledTextInputContent>
              </StyledTextInputArea>
              {(type === "pitch" || type === "story") && (
                <StyledFormHelperText
                  component="div"
                  className={limitAnimation ? "limit" : undefined}
                >
                  {dialogHelperText}
                </StyledFormHelperText>
              )}
              {(type === "image" || type === "audio") && !doc.delisted && (
                <StyledAttachmentArea>
                  <StyledFileInputButton fullWidth style={fileInputButtonStyle}>
                    <StyledFileInput
                      id={type}
                      type="file"
                      accept={getFileType(type)}
                      onChange={handleUploadFile}
                    />
                    <StyledFileInputLabel htmlFor={type}>
                      <StyledIconArea>
                        <FontIcon aria-label={`Upload`} size={16}>
                          {type === "image" ? (
                            <ImageSolidIcon />
                          ) : type === "audio" ? (
                            <VolumeHighSolidIcon />
                          ) : undefined}
                        </FontIcon>
                      </StyledIconArea>
                      {fileUrlState ? `Replace File` : `Upload File`}
                    </StyledFileInputLabel>
                  </StyledFileInputButton>
                </StyledAttachmentArea>
              )}
              <div style={keyboardSpacerStyle} />
            </StyledFormArea>
          </StyledContainer>
        </StyledViewportArea>
        <CropDialog
          aspectRatio={aspectRatioState}
          square={squareState}
          value={cropState}
          open={cropDialogOpen}
          src={fileUrlState}
          maxWidth={maxWidth}
          backgroundColor={backgroundHexState}
          onSquare={setSquareState}
          onClose={handleCloseCropDialog}
          onSave={handleCrop}
        />
      </>
    );
  }
);

export default CreateContributionForm;
