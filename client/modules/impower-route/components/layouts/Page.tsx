import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import AppBar from "@material-ui/core/AppBar";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import Divider from "@material-ui/core/Divider";
import IconButton from "@material-ui/core/IconButton";
import Link from "@material-ui/core/Link";
import MenuItem from "@material-ui/core/MenuItem";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Paper from "@material-ui/core/Paper";
import Select, { SelectChangeEvent } from "@material-ui/core/Select";
import Typography from "@material-ui/core/Typography";
import dynamic from "next/dynamic";
import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import ArrowDownWideShortRegularIcon from "../../../../resources/icons/regular/arrow-down-wide-short.svg";
import BellRegularIcon from "../../../../resources/icons/regular/bell.svg";
import ClockRegularIcon from "../../../../resources/icons/regular/clock.svg";
import FilterRegularIcon from "../../../../resources/icons/regular/filter.svg";
import ShareRegularIcon from "../../../../resources/icons/regular/share.svg";
import ThumbsDownRegularIcon from "../../../../resources/icons/regular/thumbs-down.svg";
import ThumbsUpRegularIcon from "../../../../resources/icons/regular/thumbs-up.svg";
import BellSolidIcon from "../../../../resources/icons/solid/bell.svg";
import FilterSolidIcon from "../../../../resources/icons/solid/filter.svg";
import ThumbsDownSolidIcon from "../../../../resources/icons/solid/thumbs-down.svg";
import ThumbsUpSolidIcon from "../../../../resources/icons/solid/thumbs-up.svg";
import XmarkSolidIcon from "../../../../resources/icons/solid/xmark.svg";
import {
  abbreviateAge,
  abbreviateCount,
  ConfigContext,
  getLabel,
} from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import format from "../../../impower-config/utils/format";
import { StorageFile } from "../../../impower-core";
import getReadableBackgroundColorHex from "../../../impower-core/utils/getReadableBackgroundColorHex";
import getReadableForegroundColorHex from "../../../impower-core/utils/getReadableForegroundColorHex";
import {
  DeveloperStatus,
  DevelopmentStatus,
  getSearchUrl,
  getTypeName,
  isProjectDocument,
  isStudioDocument,
  PageDocument,
} from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import { StorageError } from "../../../impower-storage";
import { ToastContext, toastTop } from "../../../impower-toast";
import { Breakpoint } from "../../styles/breakpoint";
import EditableAvatar from "../elements/EditableAvatar";
import EditableCover from "../elements/EditableCover";
import LazyImage from "../elements/LazyImage";
import Markdown from "../elements/Markdown";
import Slideshow from "../elements/Slideshow";
import StringInput from "../inputs/StringInput";

const Skeleton = dynamic(() => import("@material-ui/core/Skeleton"), {
  ssr: false,
});

const StyledStringInput = styled(StringInput)``;

const StyledPage = styled.div`
  display: flex;
  justify-content: center;
  * {
    min-width: 0;
  }
`;

const StyledPageLayout = styled.div`
  flex: 1;
  max-width: 960px;
  display: flex;
  flex-direction: column;
`;

const StyledPaperBackgroundContainer = styled.div`
  z-index: 1;
  padding-bottom: ${(props): string => props.theme.spacing(3)};
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledPaper = styled(Paper)`
  flex: 1;
  &.MuiPaper-root {
    padding: 0;
    border-radius: 6px;

    display: flex;
    flex-direction: column;
  }
`;

const StyledContentArea = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledPageContent = styled.div`
  position: relative;
  flex: 1;
  max-width: 100%;
`;

const StyledFlexLayout = styled.div`
  display: flex;
  max-width: 100%;
`;

const StyledLeftColumn = styled.div`
  flex: 2;
  padding: ${(props): string => props.theme.spacing(2)}
    ${(props): string => props.theme.spacing(6)};
  max-width: 100%;
`;

const StyledRightColumn = styled.div`
  flex: 1;
  min-width: 300px;
  padding: ${(props): string => props.theme.spacing(3)};
  display: flex;
  flex-direction: column;
  max-width: 100%;
`;

const StyledHeaderArea = styled.div`
  display: flex;
  justify-content: space-between;
  position: relative;
  flex-wrap: wrap-reverse;
`;

const StyledHeaderTextArea = styled.div`
  padding-top: ${(props): string => props.theme.spacing(4)};
  padding-bottom: ${(props): string => props.theme.spacing(3)};
  padding-left: ${(props): string => props.theme.spacing(6)};
  padding-right: ${(props): string => props.theme.spacing(6)};
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-width: unset;
  position: relative;
  flex: 1;
`;

const StyledHeaderButtonArea = styled.div`
  display: flex;
  justify-content: stretch;
  padding-right: ${(props): string => props.theme.spacing(1.5)};
  min-width: unset;
  flex: 1;
  position: relative;
`;

const StyledHeaderButtonAreaContent = styled.div`
  flex: 1;
  display: flex;
`;

const StyledInfoContainer = styled.div`
  display: flex;
  align-items: center;
  border-radius: ${(props): string => props.theme.spacing(1)};
  box-shadow: 0 0 0 1px ${(props): string => props.theme.colors.black10};
  padding: ${(props): string => props.theme.spacing(3)}
    ${(props): string => props.theme.spacing(2)};
  background-color: ${(props): string => props.theme.colors.black05};
  overflow: hidden;
`;

const StyledInfoContainerContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
`;

const StyledInfoTop = styled.div`
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
`;

const StyledInfoBottom = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 ${(props): string => props.theme.spacing(2)};
`;

const StyledInfoBottomContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  max-width: 100%;
`;

const StyledInfoDetails = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(1)} 0;
  flex: 1000;
  min-width: auto;
`;

const StyledSummaryArea = styled.div`
  padding: ${(props): string => props.theme.spacing(1)} 0;
  max-width: 100%;
  overflow: hidden;
`;

const StyledAllTagsArea = styled.div`
  padding: ${(props): string => props.theme.spacing(1)} 0;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const StyledAllTagsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  padding-top: ${(props): string => props.theme.spacing(0.5)};
`;

const StyledList = styled.div`
  display: flex;
  align-items: center;
`;

const StyledInfoTypography = styled(Typography)`
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  display: block;
  line-height: 1.8;
  white-space: pre;
`;

const StyledIconArea = styled.div`
  display: flex;
  align-items: center;
  flex-direction: column;
  padding-top: ${(props): string => props.theme.spacing(1)};
  padding-bottom: ${(props): string => props.theme.spacing(1)};
`;

const StyledIconContent = styled.div`
  min-width: ${(props): string => props.theme.spacing(15)};
  position: relative;
`;

const StyledIcon = styled.div`
  position: relative;
  border-radius: 50%;
  width: 100%;
  padding-top: 100%;
`;

const StyledIconBackground = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: inherit;
  padding: ${(props): string => props.theme.spacing(0.5)};
`;

const StyledTagArea = styled.div`
  padding-top: ${(props): string => props.theme.spacing(1)};
  padding-bottom: ${(props): string => props.theme.spacing(1.5)};
  display: flex;
  white-space: pre;
`;

const StyledTagListItem = styled.div`
  display: flex;
`;

const StyledTagTypography = styled(Typography)`
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  line-height: 1.5;
  white-space: pre;
`;

const StyledTagLink = styled(Link)`
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  line-height: 1.5;
  white-space: pre;
  color: black;
`;

const StyledNameTypography = styled(Typography)`
  margin-left: -${(props): string => props.theme.spacing(0.2)};
  padding-bottom: ${(props): string => props.theme.spacing(0.5)};
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  font-size: 1.75rem;
  line-height: 1.2;
`;

const StyledDeveloperArea = styled.div`
  padding-top: ${(props): string => props.theme.spacing(0.5)};
  display: flex;
`;

const StyledDeveloperTypography = styled(Typography)`
  opacity: 0.6;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  font-size: ${(props): string => props.theme.fontSize.regular};
  white-space: pre;
`;

const StyledDeveloperLink = styled(Link)`
  opacity: 0.6;
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  font-size: ${(props): string => props.theme.fontSize.regular};
  white-space: pre;
  color: black;
`;

const StyledSummaryTypography = styled(Typography)`
  font-size: ${(props): string => props.theme.fontSize.regular};
  overflow-wrap: break-word;
`;

const StyledPlayerArea = styled.div`
  overflow: hidden;
  background-color: black;
`;

const StyledDescriptionArea = styled.div`
  max-width: 100%;
  overflow: hidden;
`;

const StyledScreenshotArea = styled.div`
  margin-top: ${(props): string => props.theme.spacing(2)};
`;

const StyledPageDialog = styled(Dialog)`
  & .MuiDialog-container.MuiDialog-scrollPaper {
    will-change: transform;
    transform: translateZ(0);
  }

  & .MuiPaper-root {
    overflow: hidden;
  }
`;

const StyledActionButton = styled(Button)`
  flex: 1;
  min-width: ${(props): string => props.theme.spacing(15)};
  margin: ${(props): string => props.theme.spacing(1)} 0;
`;

const StyledEngagementButton = styled(Button)`
  min-width: ${(props): string => props.theme.spacing(9)};
  min-height: ${(props): string => props.theme.spacing(8)};
  padding: ${(props): string => props.theme.spacing(1)}
    ${(props): string => props.theme.spacing(2)};
  flex: 1;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: ${(props): string => props.theme.fontSize.small};
`;

const StyledEngagementButtonTypography = styled(Typography)`
  padding-top: ${(props): string => props.theme.spacing(1.5)};
  line-height: 1;
  opacity: 0.8;
  font-size: ${(props): string => props.theme.fontSize.small};
`;

const StyledCommentsArea = styled.div``;

const StyledCommentsHeaderArea = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
`;

const StyledYourCommentArea = styled.div<{ color: string }>`
  display: flex;
  flex-direction: column;
  padding: ${(props): string => props.theme.spacing(2)} 0;

  & .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline {
    border-color: ${(props): string => props.color};
  }

  & .MuiFormLabel-root.Mui-focused {
    color: ${(props): string => props.color};
  }
`;

const StyledYourCommentButtonsArea = styled.div`
  display: flex;
  margin: ${(props): string => props.theme.spacing(0.5)} 0;
  flex-wrap: wrap;
`;

const StyledRecommendButtonsArea = styled.div`
  flex: 1;
  display: flex;
  min-width: auto;
`;

const StyledRecommendButtonsContent = styled.div`
  display: flex;
  align-items: center;
  padding: ${(props): string => props.theme.spacing(0.5)} 0;
`;

const StyledPostButtonArea = styled.div`
  flex: 1000;
  display: flex;
  justify-content: flex-end;
  padding: ${(props): string => props.theme.spacing(0.5)} 0;
  min-width: auto;
`;

const StyledCommentsDividerArea = styled.div`
  padding: ${(props): string => props.theme.spacing(2)} 0;
`;

const StyledCommentsTitleTypography = styled(Typography)`
  font-weight: ${(props): number => props.theme.fontWeight.bold};
  font-size: 1.125rem;
`;

const StyledCommentCountTypography = styled(StyledCommentsTitleTypography)`
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  opacity: 0.6;
  padding-left: ${(props): string => props.theme.spacing(1)};
`;

const StyledCommentsTitleArea = styled.div`
  flex: 1;
  display: flex;
  padding-top: ${(props): string => props.theme.spacing(0.5)};
  padding-bottom: ${(props): string => props.theme.spacing(0.5)};
  padding-right: ${(props): string => props.theme.spacing(1)};
  min-width: auto;
`;

const StyledSortArea = styled.div`
  display: flex;
  padding: ${(props): string => props.theme.spacing(0.5)} 0;
`;

const StyledSortSpacer = styled.div`
  min-width: ${(props): string => props.theme.spacing(1)};
`;

const StyledSortButton = styled(Button)`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${(props): string => props.theme.fontSize.small};
`;

const StyledSortSelect = styled(Select)`
  padding-top: 1px;
  padding-left: ${(props): string => props.theme.spacing(1)};
  padding-right: ${(props): string => props.theme.spacing(1)};
  padding-bottom: ${(props): string => props.theme.spacing(0.5)};
  border-radius: ${(props): string => props.theme.spacing(1)};
  &.MuiInput-underline:after {
    display: none;
  }
  &.MuiInput-underline:before {
    display: none;
  }
  &.MuiInput-root:hover {
    text-decoration: none;
    background-color: rgba(0, 0, 0, 0.04);
  }
  &.MuiInput-root:focus {
    text-decoration: none;
    background-color: rgba(0, 0, 0, 0.04);
  }
  & .MuiSelect-select:focus {
    background-color: transparent;
  }
  & .MuiInputBase-input {
    padding-bottom: 6px;
  }
`;

const StyledPostButton = styled(Button)`
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
`;

const StyledSortIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1)};
`;

const StyledSortButtonTypography = styled(Typography)`
  line-height: 1;
  opacity: 0.8;
  font-size: ${(props): string => props.theme.fontSize.small};
`;

const StyledCommentButtonTypography = styled(Typography)`
  padding-left: ${(props): string => props.theme.spacing(1)};
  line-height: 1;
  font-size: ${(props): string => props.theme.fontSize.small};
`;

const StyledRecommendTypography = styled(Typography)`
  padding-right: ${(props): string => props.theme.spacing(1)};
  font-size: 0.875rem;
`;

const StyledBanner = styled.div`
  padding-top: ${(props): string => props.theme.spacing(1)};
  padding-bottom: ${(props): string => props.theme.spacing(1)};
  padding-left: ${(props): string => props.theme.spacing(3)};
  padding-right: ${(props): string => props.theme.spacing(2)};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const StyledBannerTypography = styled(Typography)`
  padding: ${(props): string => props.theme.spacing(1, 0)};
`;

const StyledBannerButton = styled(Button)``;

const StyledStatusDialog = styled(Dialog)<{ bgcolor: string }>`
  & .MuiPaper-root {
    background-color: ${(props): string => props.bgcolor};
  }
  * {
    min-width: 0;
  }
`;

const StyledStatusAppBar = styled(AppBar)``;

const StyledStatusToolbar = styled.div`
  display: flex;
  align-items: center;
`;

const StyledStatusDialogContent = styled.div`
  padding: ${(props): string => props.theme.spacing(2)}
    ${(props): string => props.theme.spacing(4)};
  background-color: white;
`;

const StyledStatusTitleTypography = styled(Typography)`
  padding-left: ${(props): string => props.theme.spacing(1)};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  font-size: ${(props): string => props.theme.fontSize.large};
  white-space: nowrap;
`;

const StyledIconButton = styled(IconButton)``;

const backLabel = "Back";
const nextLabel = "Next";
const sortLabels = ["Top", "Hot", "New"];
const rangeLabels = [
  "Now",
  "Today",
  "This Week",
  "This Month",
  "This Year",
  "All Time",
];
const filterLabels = ["All", "Positive", "Negative"];

interface CommentsProps {
  doc?: PageDocument;
  liked?: boolean;
  disliked?: boolean;
  commentsLabel: string;
  yourCommentLabel: string;
  yourCommentPlaceholder: string;
  postCommentLabel: string;
  allowRating?: boolean;
  onLike?: (liked: boolean) => void;
  onDislike?: (disliked: boolean) => void;
  onPost?: (content: string) => void;
}

const Comments = React.memo((props: CommentsProps): JSX.Element => {
  const {
    doc,
    liked,
    disliked,
    commentsLabel,
    yourCommentLabel,
    yourCommentPlaceholder,
    postCommentLabel,
    allowRating,
    onLike = (): void => null,
    onDislike = (): void => null,
    onPost = (): void => null,
  } = props;

  const [filterIndex, setFilterIndex] = useState(0);
  const [sortIndex, setSortIndex] = useState(0);
  const [range, setRange] = useState("This Month");
  const [comment, setComment] = useState("");

  const theme = useTheme();
  const handleClickFilter = useCallback((): void => {
    if (filterIndex < filterLabels?.length - 1) {
      setFilterIndex(filterIndex + 1);
    } else {
      setFilterIndex(0);
    }
  }, [filterIndex]);

  const handleClickSort = useCallback((): void => {
    if (sortIndex < sortLabels?.length - 1) {
      setSortIndex(sortIndex + 1);
    } else {
      setSortIndex(0);
    }
  }, [sortIndex]);

  const handleClickRange = useCallback((e: SelectChangeEvent<string>): void => {
    const { value } = e.target;
    setRange(value);
  }, []);

  const handlePost = useCallback((): void => {
    onPost(comment);
    setComment("");
  }, [onPost, comment]);

  const handleComment = useCallback(
    (value: string): void => {
      if (value) {
        if (allowRating && !liked && !disliked) {
          onLike(true);
        }
      }
      setComment(value);
    },
    [allowRating, disliked, liked, onLike]
  );

  const mainColor = doc?.hex;

  const readableForegroundMainColor = getReadableForegroundColorHex(
    mainColor,
    "white",
    0.25
  );

  const canPost = comment && (!allowRating || liked || disliked);

  const commentsCount = doc?.comments || 0;

  return (
    <StyledCommentsArea>
      <StyledCommentsHeaderArea>
        <StyledCommentsTitleArea>
          <StyledCommentsTitleTypography variant="h5">
            {commentsLabel}
          </StyledCommentsTitleTypography>
          <StyledCommentCountTypography variant="h5">
            ({abbreviateCount(commentsCount)})
          </StyledCommentCountTypography>
        </StyledCommentsTitleArea>
        <StyledSortArea>
          {allowRating && (
            <>
              <StyledSortButton onClick={handleClickFilter}>
                <StyledSortIconArea>
                  <FontIcon
                    aria-label="Filter"
                    color={theme.colors.black50}
                    size={theme.fontSize.smallerIcon}
                  >
                    {filterIndex === 0 ? (
                      <FilterRegularIcon />
                    ) : (
                      <FilterSolidIcon />
                    )}
                  </FontIcon>
                </StyledSortIconArea>
                <StyledSortButtonTypography variant="button">
                  {filterLabels[filterIndex]}
                </StyledSortButtonTypography>
              </StyledSortButton>
              <StyledSortSpacer />
            </>
          )}
          <StyledSortButton onClick={handleClickSort}>
            <StyledSortIconArea>
              <FontIcon
                aria-label="Sort"
                color={theme.colors.black50}
                size={theme.fontSize.smallerIcon}
              >
                <ArrowDownWideShortRegularIcon />
              </FontIcon>
            </StyledSortIconArea>
            <StyledSortButtonTypography variant="button">
              {sortLabels[sortIndex]}
            </StyledSortButtonTypography>
          </StyledSortButton>
          <StyledSortSpacer />
          <StyledSortSelect
            disabled={sortIndex > 0}
            value={sortIndex > 0 ? rangeLabels[0] : range}
            onChange={handleClickRange}
          >
            {(sortIndex > 0 ? [rangeLabels[0]] : rangeLabels).map((label) => (
              <MenuItem key={label} value={label}>
                <StyledSortButtonTypography variant="button">
                  {label}
                </StyledSortButtonTypography>
              </MenuItem>
            ))}
          </StyledSortSelect>
        </StyledSortArea>
      </StyledCommentsHeaderArea>
      <StyledYourCommentArea color={readableForegroundMainColor}>
        <StyledStringInput
          variant="outlined"
          InputComponent={OutlinedInput}
          label={yourCommentLabel}
          placeholder={format(yourCommentPlaceholder, {
            doc: getTypeName(doc._documentType).toLowerCase(),
          })}
          value={comment}
          characterCountLimit={10000}
          onDebouncedChange={handleComment}
          multiline
        />
        <StyledYourCommentButtonsArea>
          <StyledRecommendButtonsArea>
            {allowRating && (
              <StyledRecommendButtonsContent>
                <StyledRecommendTypography>
                  {`Recommend?`}
                </StyledRecommendTypography>
                <StyledPostButton onClick={(): void => onLike(true)}>
                  <FontIcon
                    aria-label="Like"
                    color={theme.colors.black80}
                    size={14}
                  >
                    {liked ? <ThumbsUpSolidIcon /> : <ThumbsUpRegularIcon />}
                  </FontIcon>
                  <StyledCommentButtonTypography variant="button">
                    {`Yes`}
                  </StyledCommentButtonTypography>
                </StyledPostButton>
                <StyledPostButton onClick={(): void => onDislike(true)}>
                  <FontIcon
                    aria-label="Dislike"
                    color={theme.colors.black80}
                    size={14}
                  >
                    {disliked ? (
                      <ThumbsDownSolidIcon />
                    ) : (
                      <ThumbsDownRegularIcon />
                    )}
                  </FontIcon>
                  <StyledCommentButtonTypography variant="button">
                    {`No`}
                  </StyledCommentButtonTypography>
                </StyledPostButton>
              </StyledRecommendButtonsContent>
            )}
          </StyledRecommendButtonsArea>
          <StyledPostButtonArea>
            <StyledPostButton
              onClick={handlePost}
              variant="contained"
              disableElevation
              disabled={!canPost}
              style={{
                backgroundColor: canPost
                  ? readableForegroundMainColor
                  : undefined,
                color: canPost ? "white" : undefined,
              }}
            >
              {postCommentLabel}
            </StyledPostButton>
          </StyledPostButtonArea>
        </StyledYourCommentButtonsArea>
      </StyledYourCommentArea>
    </StyledCommentsArea>
  );
});

interface PageContentProps {
  doc?: PageDocument;
  edit?: boolean;
  preview?: boolean;
  playerAspectRatio?: number;
  breakpoint?: Breakpoint;
  images?: string[];
  placeholders?: { [originalSrc: string]: string };
  liked: boolean;
  disliked: boolean;
  onStorageError?: (error: StorageError) => void;
  onDebouncedPropertyChange?: (propertyPath: string, value: unknown) => void;
  onAction?: () => void;
  onLike?: (liked: boolean) => void;
  onDislike?: (disliked: boolean) => void;
  onPostComment?: (content: string) => void;
  onPostReview?: (content: string) => void;
  getPublicUrl?: (fileUrl: string) => string;
  getPlaceholderUrl?: (fileUrl: string) => string;
}

const PageContent = React.memo((props: PageContentProps): JSX.Element => {
  const {
    doc,
    edit,
    playerAspectRatio,
    breakpoint,
    images,
    placeholders,
    liked,
    disliked,
    onStorageError,
    onDebouncedPropertyChange,
    onAction,
    onLike,
    onDislike,
    onPostComment,
    onPostReview,
    getPublicUrl,
    getPlaceholderUrl,
  } = props;

  const [imageIndex, setImageIndex] = useState(0);
  const [dialogOpen, setDialogOpen] = useState<boolean>();

  const [configState] = useContext(ConfigContext);

  const handleIconUpload = useCallback(
    async (file: StorageFile) => {
      if (doc?.icon?.storageKey) {
        const Storage = (
          await import("../../../impower-storage/classes/storage")
        ).default;
        await Storage.instance.delete(doc.icon.storageKey);
      }
      onDebouncedPropertyChange("icon", file);
    },
    [doc.icon.storageKey, onDebouncedPropertyChange]
  );

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.i !== prevState?.i) {
        setDialogOpen(currState?.i === "slideshow");
      }
    },
    []
  );
  const [openInfoDialog, closeInfoDialog] = useDialogNavigation(
    "i",
    handleBrowserNavigation
  );

  const handleOpenSlideshowPopup = useCallback(
    (index: number): void => {
      setImageIndex(index);
      setDialogOpen(true);
      openInfoDialog("slideshow");
    },
    [openInfoDialog]
  );

  const handleCloseSlideshowPopup = useCallback((): void => {
    closeInfoDialog();
  }, [closeInfoDialog]);

  const theme = useTheme();

  const iconImage = useMemo(
    () => getPublicUrl(doc?.icon?.fileUrl),
    [doc, getPublicUrl]
  );

  const mainColor = doc?.hex;

  const readableBackgroundMainColor = getReadableBackgroundColorHex(
    "white",
    mainColor
  );

  const followersCount = doc?.follows || 0;

  const publishedAt =
    typeof doc?.publishedAt === "string"
      ? new Date(doc?.publishedAt)
      : doc?.publishedAt?.toDate?.();

  const republishedAt =
    typeof doc?.republishedAt === "string"
      ? new Date(doc?.republishedAt)
      : doc?.republishedAt?.toDate?.();

  const updatedAt =
    typeof doc?._updatedAt === "string"
      ? new Date(doc?._updatedAt)
      : doc?._updatedAt?.toDate?.();

  const mainTag = doc?.tags?.[0] || "";
  const tagIconNames =
    configState?.tagIconNames || ConfigCache.instance.params?.tagIconNames;
  const tagDisambiguations =
    configState?.tagDisambiguations ||
    ConfigCache.instance.params?.tagDisambiguations;
  const validMainTag = tagDisambiguations[mainTag]?.[0] || mainTag;
  const tagIconName = tagIconNames?.[validMainTag] || "hashtag";

  return (
    <StyledPageContent>
      <StyledFlexLayout
        style={{
          flexDirection:
            breakpoint <= Breakpoint.md ? "column-reverse" : undefined,
        }}
      >
        {!edit && (
          <StyledLeftColumn
            style={{
              maxWidth: breakpoint <= Breakpoint.md ? undefined : 608,
              padding:
                breakpoint <= Breakpoint.sm
                  ? `${theme.spacing(2)} ${theme.spacing(3)}`
                  : undefined,
            }}
          >
            {doc ? (
              doc.description && (
                <StyledDescriptionArea>
                  <Markdown style={{ fontSize: theme.fontSize.regular }}>
                    {doc.description}
                  </Markdown>
                </StyledDescriptionArea>
              )
            ) : (
              <StyledDescriptionArea>
                <Skeleton variant="rectangular" width="100%" height={300} />
              </StyledDescriptionArea>
            )}
            {doc && doc.description && (
              <StyledCommentsDividerArea>
                <Divider />
              </StyledCommentsDividerArea>
            )}
            {doc &&
              (doc.status === DevelopmentStatus.Launched ? (
                <Comments
                  doc={doc}
                  liked={liked}
                  disliked={disliked}
                  commentsLabel="Review"
                  yourCommentLabel="Your Review"
                  yourCommentPlaceholder="Describe what you like or dislike about this {doc}"
                  postCommentLabel="Post Review"
                  onLike={onLike}
                  onDislike={onDislike}
                  onPost={onPostReview}
                  allowRating
                />
              ) : doc.status === DevelopmentStatus.EarlyAccess ? (
                <Comments
                  doc={doc}
                  onPost={onPostComment}
                  commentsLabel="Feedback"
                  yourCommentLabel="Your Feedback"
                  yourCommentPlaceholder="Describe what you like or dislike about this {doc}"
                  postCommentLabel="Post Feedback"
                />
              ) : (
                <Comments
                  doc={doc}
                  onPost={onPostComment}
                  commentsLabel="Comments"
                  yourCommentLabel="Your Comment"
                  yourCommentPlaceholder="What do you think about this {doc}?"
                  postCommentLabel="Post Comment"
                />
              ))}
          </StyledLeftColumn>
        )}
        <StyledRightColumn
          style={{
            padding: breakpoint <= Breakpoint.md ? 0 : undefined,
          }}
        >
          <StyledInfoContainer
            style={{
              flexDirection:
                breakpoint <= Breakpoint.sm
                  ? "column"
                  : breakpoint <= Breakpoint.md
                  ? "row"
                  : "column",
              alignItems:
                breakpoint <= Breakpoint.sm && !edit ? "flex-start" : undefined,
              borderRadius: breakpoint <= Breakpoint.md ? 0 : undefined,
              paddingTop:
                breakpoint <= Breakpoint.sm ? theme.spacing(2) : undefined,
              paddingBottom:
                breakpoint <= Breakpoint.sm ? theme.spacing(2) : undefined,
              paddingLeft:
                breakpoint <= Breakpoint.sm
                  ? theme.spacing(1)
                  : breakpoint <= Breakpoint.md
                  ? theme.spacing(4)
                  : undefined,
              paddingRight:
                breakpoint <= Breakpoint.sm
                  ? theme.spacing(1)
                  : breakpoint <= Breakpoint.md
                  ? theme.spacing(4)
                  : undefined,
              marginTop: breakpoint <= Breakpoint.md ? 0 : undefined,
              marginLeft: breakpoint <= Breakpoint.md ? 0 : undefined,
              marginRight: breakpoint <= Breakpoint.md ? 0 : undefined,
            }}
          >
            <StyledInfoTop
              style={{
                paddingLeft:
                  breakpoint <= Breakpoint.sm
                    ? theme.spacing(2)
                    : breakpoint <= Breakpoint.md
                    ? theme.spacing(2)
                    : undefined,
                paddingRight:
                  breakpoint <= Breakpoint.sm
                    ? theme.spacing(2)
                    : breakpoint <= Breakpoint.md
                    ? theme.spacing(2)
                    : undefined,
                flexDirection: breakpoint <= Breakpoint.sm ? "row" : undefined,
                width: breakpoint <= Breakpoint.sm ? "100%" : undefined,
              }}
            >
              <StyledIconArea>
                <StyledIconContent
                  style={{
                    minWidth:
                      breakpoint <= Breakpoint.sm
                        ? theme.spacing(12)
                        : undefined,
                  }}
                >
                  <StyledIcon>
                    <StyledIconBackground
                      style={{
                        backgroundColor: mainColor,
                      }}
                    >
                      <EditableAvatar
                        color={mainColor}
                        iconSrc={iconImage}
                        name={doc?.name}
                        defaultIcon={
                          mainTag ? (
                            <DynamicIcon icon={tagIconName} />
                          ) : undefined
                        }
                        edit={edit}
                        onUpload={handleIconUpload}
                        onError={onStorageError}
                        getPlaceholderUrl={getPlaceholderUrl}
                      />
                    </StyledIconBackground>
                  </StyledIcon>
                </StyledIconContent>
              </StyledIconArea>
              {!edit && (
                <>
                  <StyledInfoDetails
                    style={{
                      alignItems:
                        breakpoint <= Breakpoint.sm
                          ? "flex-start"
                          : breakpoint <= Breakpoint.md
                          ? "center"
                          : undefined,
                      paddingTop: breakpoint <= Breakpoint.md ? 0 : undefined,
                      paddingLeft:
                        breakpoint <= Breakpoint.sm
                          ? theme.spacing(3)
                          : undefined,
                    }}
                  >
                    <StyledInfoTypography variant="overline">
                      {doc ? (
                        <>
                          {isProjectDocument(doc) &&
                            `${`${abbreviateCount(followersCount)} Followers`}`}
                          {isStudioDocument(doc) &&
                            `${abbreviateCount(followersCount)} Followers`}
                        </>
                      ) : (
                        <Skeleton width={80} />
                      )}
                    </StyledInfoTypography>
                    <StyledInfoTypography variant="overline">
                      {doc ? (
                        <>
                          {`${getLabel(doc.status || "")}`}
                          {isProjectDocument(doc) &&
                            (doc.status === DevelopmentStatus.EarlyAccess ||
                              doc.status === DevelopmentStatus.Launched) &&
                            ` (${doc.version})`}
                        </>
                      ) : (
                        <Skeleton width={120} />
                      )}
                    </StyledInfoTypography>
                    <StyledList>
                      {doc ? (
                        <>
                          <FontIcon aria-label="Last Published At" size={12}>
                            <ClockRegularIcon />
                          </FontIcon>
                          <StyledInfoTypography variant="overline">
                            {` ${abbreviateAge(
                              republishedAt || publishedAt || updatedAt
                            )}`}
                          </StyledInfoTypography>
                        </>
                      ) : (
                        <Skeleton width={100} />
                      )}
                    </StyledList>
                  </StyledInfoDetails>
                  {doc ? (
                    (doc.status === DevelopmentStatus.Launched ||
                      doc.status === DevelopmentStatus.EarlyAccess) && (
                      <StyledActionButton
                        color="primary"
                        variant="contained"
                        onClick={onAction}
                        style={{
                          backgroundColor: readableBackgroundMainColor,
                        }}
                      >
                        {isProjectDocument(doc) && `Download`}
                        {isStudioDocument(doc) && `Follow`}
                      </StyledActionButton>
                    )
                  ) : (
                    <Skeleton width={150} height={64} />
                  )}
                </>
              )}
            </StyledInfoTop>
            <StyledInfoContainerContent
              style={{
                paddingLeft:
                  breakpoint <= Breakpoint.sm
                    ? undefined
                    : breakpoint <= Breakpoint.md
                    ? theme.spacing(2)
                    : undefined,
              }}
            >
              <StyledInfoBottom
                style={{
                  alignItems:
                    breakpoint <= Breakpoint.sm
                      ? "center"
                      : breakpoint <= Breakpoint.md
                      ? "flex-start"
                      : undefined,
                }}
              >
                <StyledInfoBottomContent
                  style={{
                    alignItems:
                      breakpoint <= Breakpoint.sm
                        ? "center"
                        : breakpoint <= Breakpoint.md
                        ? "flex-start"
                        : undefined,
                  }}
                >
                  {doc ? (
                    doc.summary && (
                      <StyledSummaryArea>
                        <StyledSummaryTypography
                          variant="body2"
                          style={{
                            textAlign:
                              breakpoint <= Breakpoint.sm
                                ? "justify"
                                : breakpoint <= Breakpoint.md
                                ? undefined
                                : "justify",
                          }}
                        >
                          {doc.summary}
                        </StyledSummaryTypography>
                      </StyledSummaryArea>
                    )
                  ) : (
                    <StyledSummaryArea>
                      <StyledSummaryTypography variant="body2">
                        <Skeleton
                          variant="rectangular"
                          width={200}
                          height={150}
                        />
                      </StyledSummaryTypography>
                    </StyledSummaryArea>
                  )}
                  {(!doc || doc.tags) && (
                    <StyledAllTagsArea
                      style={{
                        alignItems:
                          breakpoint <= Breakpoint.sm
                            ? "center"
                            : breakpoint <= Breakpoint.md
                            ? "flex-start"
                            : undefined,
                      }}
                    >
                      <StyledInfoTypography variant="overline">
                        {doc ? `Tags:` : <Skeleton width={50} />}
                      </StyledInfoTypography>
                      <StyledAllTagsList
                        style={{
                          justifyContent:
                            breakpoint <= Breakpoint.sm
                              ? "center"
                              : breakpoint <= Breakpoint.md
                              ? "flex-start"
                              : undefined,
                        }}
                      >
                        {doc ? (
                          doc.tags.map((tag, index) => (
                            <StyledTagListItem key={tag}>
                              <StyledTagLink
                                variant="overline"
                                href={getSearchUrl(doc?._documentType, tag)}
                              >
                                {tag}
                              </StyledTagLink>
                              {doc.tags.length > 1 &&
                                index < doc.tags.length - 1 && (
                                  <StyledTagTypography variant="overline">
                                    {`, `}
                                  </StyledTagTypography>
                                )}
                            </StyledTagListItem>
                          ))
                        ) : (
                          <StyledTagListItem>
                            <StyledTagTypography variant="overline">
                              <Skeleton width={80} />
                            </StyledTagTypography>
                          </StyledTagListItem>
                        )}
                      </StyledAllTagsList>
                    </StyledAllTagsArea>
                  )}
                </StyledInfoBottomContent>
              </StyledInfoBottom>
            </StyledInfoContainerContent>
          </StyledInfoContainer>
          {!edit && images && images.length > 0 && (
            <StyledScreenshotArea
              style={{
                marginTop: breakpoint <= Breakpoint.md ? 0 : undefined,
              }}
            >
              {breakpoint <= Breakpoint.md ? (
                <Slideshow
                  index={imageIndex}
                  images={images}
                  placeholders={placeholders}
                  backLabel={backLabel}
                  nextLabel={nextLabel}
                  style={{
                    marginLeft: breakpoint <= Breakpoint.md ? 0 : undefined,
                    marginRight: breakpoint <= Breakpoint.md ? 0 : undefined,
                  }}
                  imageStyle={{
                    width: "100%",
                    paddingBottom: `${playerAspectRatio * 100}%`,
                  }}
                  onSetIndex={setImageIndex}
                />
              ) : (
                images.map((image, index) => (
                  <StyledIconButton
                    key={image}
                    style={{
                      borderRadius: 0,
                      position: "relative",
                      width: "100%",
                      paddingBottom: `${playerAspectRatio * 100}%`,
                      marginTop: theme.spacing(1),
                    }}
                    onClick={(): void => handleOpenSlideshowPopup(index)}
                    size="large"
                  >
                    <LazyImage
                      src={image}
                      placeholder={getPlaceholderUrl(image)}
                      objectFit="cover"
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        right: 0,
                      }}
                    />
                  </StyledIconButton>
                ))
              )}
              <StyledPageDialog
                open={dialogOpen}
                onClose={handleCloseSlideshowPopup}
                fullWidth={true}
                maxWidth={"lg"}
              >
                <Slideshow
                  index={imageIndex}
                  images={images}
                  placeholders={placeholders}
                  backLabel={backLabel}
                  nextLabel={nextLabel}
                  imageStyle={{
                    width: "100%",
                    paddingBottom: `${playerAspectRatio * 100}%`,
                  }}
                  onSetIndex={setImageIndex}
                />
              </StyledPageDialog>
            </StyledScreenshotArea>
          )}
        </StyledRightColumn>
      </StyledFlexLayout>
    </StyledPageContent>
  );
});

interface PageProps {
  innerRef?: React.Ref<HTMLDivElement>;
  docId: string;
  doc?: PageDocument;
  uid: string;
  edit?: boolean;
  preview?: boolean;
  folded?: boolean;
  playerAspectRatio?: number;
  breakpoint?: Breakpoint;
  fullscreenPlayer?: boolean;
  liked?: boolean;
  disliked?: boolean;
  followed?: boolean;
  onFolded?: (liked: boolean) => void;
  onDebouncedPropertyChange?: (propertyPath: string, value: unknown) => void;
  onAction?: () => void;
  onLike?: (like: boolean) => void;
  onDislike?: (dislike: boolean) => void;
  onShare?: () => void;
  onFollow?: (followed: boolean) => void;
  onPostComment?: (content: string) => void;
  getPublicUrl?: (fileUrl: string) => string;
  getPlaceholderUrl?: (fileUrl: string) => string;
}

const Page = React.memo((props: PropsWithChildren<PageProps>): JSX.Element => {
  const {
    innerRef,
    doc,
    uid,
    edit,
    preview,
    folded,
    playerAspectRatio = 9 / 16,
    breakpoint,
    fullscreenPlayer,
    liked = false,
    disliked = false,
    followed = false,
    onFolded = (): void => null,
    onDebouncedPropertyChange = (): void => null,
    onAction = (): void => null,
    onLike = (): void => null,
    onDislike = (): void => null,
    onShare = (): void => null,
    onFollow = (): void => null,
    onPostComment = (): void => null,
    getPublicUrl = (fileUrl: string): string => fileUrl,
    getPlaceholderUrl = (): string => "",
    children,
  } = props;

  const [configState] = useContext(ConfigContext);
  const [, toastDispatch] = useContext(ToastContext);

  const [isLiked, setIsLiked] = useState(liked);
  const [isDisliked, setIsDisliked] = useState(disliked);
  const [isFollowed, setIsFollowed] = useState(followed);
  const [dialogOpen, setDialogOpen] = useState<boolean>();

  const isFolded = edit || folded;

  const developerHandle = doc._author?.u;
  const developerLink = `/u/${developerHandle}`;

  useEffect(() => {
    setIsLiked(liked);
  }, [liked]);

  useEffect(() => {
    setIsDisliked(disliked);
  }, [disliked]);

  useEffect(() => {
    setIsFollowed(followed);
  }, [followed]);

  const handleLogoUpload = useCallback(
    async (file: StorageFile) => {
      if (doc?.logo?.storageKey) {
        const Storage = (
          await import("../../../impower-storage/classes/storage")
        ).default;
        await Storage.instance.delete(doc.logo.storageKey);
      }
      onDebouncedPropertyChange("logo", file);
    },
    [doc.logo.storageKey, onDebouncedPropertyChange]
  );

  const handleCoverUpload = useCallback(
    async (file: StorageFile) => {
      if (doc?.cover?.storageKey) {
        const Storage = (
          await import("../../../impower-storage/classes/storage")
        ).default;
        await Storage.instance.delete(doc.cover.storageKey);
      }
      onDebouncedPropertyChange("cover", file);
    },
    [doc.cover.storageKey, onDebouncedPropertyChange]
  );

  const handleStorageError = useCallback(
    (error: StorageError): void => {
      toastDispatch(toastTop(error.message, "error"));
    },
    [toastDispatch]
  );

  const handleLike = useCallback((): void => {
    setIsLiked(!isLiked);
    onLike(!isLiked);
    if (isDisliked) {
      setIsDisliked(false);
      onDislike(false);
    }
  }, [isDisliked, isLiked, onDislike, onLike]);

  const handleDislike = useCallback((): void => {
    setIsDisliked(!isDisliked);
    onDislike(!isDisliked);
    if (isLiked) {
      setIsLiked(false);
      onLike(false);
    }
  }, [isDisliked, isLiked, onDislike, onLike]);

  const handleFollow = useCallback((): void => {
    setIsFollowed(!isFollowed);
    onFollow(!isFollowed);
  }, [onFollow, isFollowed]);

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.i !== prevState?.i) {
        setDialogOpen(currState?.i === "status");
      }
    },
    []
  );
  const [openInfoDialog, closeInfoDialog] = useDialogNavigation(
    "i",
    handleBrowserNavigation
  );

  const handleOpenStatusDialog = useCallback((): void => {
    setDialogOpen(true);
    openInfoDialog("status");
  }, [openInfoDialog]);

  const handleCloseStatusDialog = useCallback((): void => {
    setDialogOpen(false);
    closeInfoDialog();
  }, [closeInfoDialog]);

  const mainColor = doc?.hex;
  const backgroundColor = doc?.backgroundHex;

  const readableBackgroundMainColor = getReadableBackgroundColorHex(
    "white",
    mainColor,
    0.25
  );

  const developerPrefix = "by";

  const theme = useTheme();

  const screenshotImages = useMemo(
    () =>
      isProjectDocument(doc)
        ? (doc?.screenshots?.order || Object.keys(doc?.screenshots?.data || {}))
            .filter((id) => doc.screenshots.data[id].fileUrl)
            .map((id) => getPublicUrl(doc.screenshots.data[id].fileUrl))
        : [],
    [doc, getPublicUrl]
  );

  const logoImage = useMemo(
    () => getPublicUrl(doc?.logo?.fileUrl),
    [doc?.logo?.fileUrl, getPublicUrl]
  );

  const coverImage = useMemo(
    () => getPublicUrl(doc?.cover?.fileUrl),
    [doc?.cover?.fileUrl, getPublicUrl]
  );

  const placeholders = useMemo(() => {
    const dict = {};
    if (coverImage) {
      dict[coverImage] = getPlaceholderUrl(coverImage);
    }
    if (logoImage) {
      dict[logoImage] = getPlaceholderUrl(logoImage);
    }
    screenshotImages.forEach((image) => {
      dict[image] = getPlaceholderUrl(image);
    });
    return dict;
  }, [coverImage, getPlaceholderUrl, logoImage, screenshotImages]);

  const likesCount = doc?.likes || 0;
  const dislikesCount = doc?.dislikes || 0;

  const tagPatterns = configState?.tagPatterns;

  return (
    <StyledPage ref={innerRef} style={{ backgroundColor }}>
      <StyledPageLayout>
        {!fullscreenPlayer && (
          <EditableCover
            color={mainColor}
            name={doc?.name}
            logoSrc={logoImage}
            coverSrc={coverImage}
            logoAlignment={doc?.logoAlignment}
            edit={edit}
            uid={uid}
            pattern={
              doc?.tags?.[0] ? tagPatterns?.[doc?.tags?.[0] || ""] : undefined
            }
            patternScale={doc?.patternScale}
            folded={isFolded}
            breakpoint={breakpoint}
            onFolded={onFolded}
            onUploadLogo={handleLogoUpload}
            onUploadCover={handleCoverUpload}
            onError={handleStorageError}
            getPlaceholderUrl={getPlaceholderUrl}
          />
        )}
        <StyledPaperBackgroundContainer
          style={{
            padding: breakpoint <= Breakpoint.sm ? 0 : undefined,
            position: fullscreenPlayer ? undefined : "relative",
          }}
        >
          <StyledPaper
            elevation={12}
            style={{
              borderRadius: breakpoint <= Breakpoint.sm ? 0 : undefined,
            }}
          >
            {!fullscreenPlayer &&
              !edit &&
              doc &&
              doc.status !== DevelopmentStatus.Launched &&
              doc.status !== DeveloperStatus.Active && (
                <StyledBanner
                  style={{
                    backgroundColor: readableBackgroundMainColor,
                    color: "white",
                  }}
                >
                  <StyledBannerTypography>
                    {getLabel(doc.status)}
                  </StyledBannerTypography>
                  {doc.status !== DeveloperStatus.Inactive &&
                    doc.statusInformation && (
                      <>
                        <StyledBannerButton
                          color="inherit"
                          onClick={handleOpenStatusDialog}
                        >{`More Info`}</StyledBannerButton>
                        <StyledStatusDialog
                          open={dialogOpen}
                          onClose={handleCloseStatusDialog}
                          bgcolor={readableBackgroundMainColor}
                        >
                          <StyledStatusAppBar
                            position="sticky"
                            style={{
                              backgroundColor: readableBackgroundMainColor,
                            }}
                          >
                            <StyledStatusToolbar>
                              <StyledIconButton
                                edge="start"
                                color="inherit"
                                onClick={handleCloseStatusDialog}
                                aria-label="close"
                                size="large"
                              >
                                <FontIcon aria-label="Close" size={24}>
                                  <XmarkSolidIcon />
                                </FontIcon>
                              </StyledIconButton>
                              <StyledStatusTitleTypography>
                                {`Development Status`}
                              </StyledStatusTitleTypography>
                            </StyledStatusToolbar>
                          </StyledStatusAppBar>
                          <StyledStatusDialogContent>
                            <Markdown>
                              {doc.statusInformation ||
                                format(
                                  "No information found on the status of this {doc}",
                                  {
                                    doc: getTypeName(
                                      doc._documentType
                                    ).toLowerCase(),
                                  }
                                )}
                            </Markdown>
                          </StyledStatusDialogContent>
                        </StyledStatusDialog>
                      </>
                    )}
                </StyledBanner>
              )}
            {children &&
              (fullscreenPlayer ||
                preview ||
                !doc ||
                doc.status === DevelopmentStatus.Launched ||
                doc.status === DevelopmentStatus.EarlyAccess) && (
                <StyledPlayerArea
                  style={
                    fullscreenPlayer
                      ? {
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: 0,
                          right: 0,
                        }
                      : {
                          position: "relative",
                          width: "100%",
                          paddingBottom: `${playerAspectRatio * 100}%`,
                        }
                  }
                >
                  {children}
                </StyledPlayerArea>
              )}
            {!fullscreenPlayer && (
              <StyledContentArea>
                <StyledHeaderArea
                  style={{
                    flexDirection:
                      breakpoint <= Breakpoint.sm
                        ? "column-reverse"
                        : undefined,
                  }}
                >
                  <StyledHeaderTextArea
                    style={{
                      alignItems:
                        breakpoint <= Breakpoint.sm ? "center" : undefined,
                      textAlign:
                        breakpoint <= Breakpoint.sm ? "center" : undefined,
                      padding:
                        breakpoint <= Breakpoint.sm
                          ? `${theme.spacing(1.5)} ${theme.spacing(3)}`
                          : undefined,
                    }}
                  >
                    <Divider absolute />
                    {doc?.tags && doc.tags.length > 0 ? (
                      <StyledTagArea
                        style={{
                          paddingTop:
                            breakpoint <= Breakpoint.sm ? 0 : undefined,
                          paddingBottom:
                            breakpoint <= Breakpoint.sm
                              ? theme.spacing(0.5)
                              : undefined,
                        }}
                      >
                        {doc.tags.slice(0, 2).map((tag, index) => (
                          <StyledTagListItem key={tag}>
                            <StyledTagLink
                              variant="overline"
                              style={{
                                fontSize: theme.typography.button.fontSize,
                                fontWeight: theme.fontWeight.bold,
                              }}
                              href={getSearchUrl(doc?._documentType, tag)}
                            >
                              {tag}
                            </StyledTagLink>
                            {doc.tags.length > 1 && index === 0 && (
                              <StyledTagTypography
                                variant="overline"
                                style={{
                                  fontSize: theme.typography.button.fontSize,
                                  fontWeight: theme.fontWeight.bold,
                                }}
                              >
                                {` | `}
                              </StyledTagTypography>
                            )}
                          </StyledTagListItem>
                        ))}
                      </StyledTagArea>
                    ) : (
                      <StyledTagTypography variant="overline">
                        <Skeleton width={150} />
                      </StyledTagTypography>
                    )}
                    <StyledNameTypography variant="h5">
                      {doc?.name || <Skeleton width={200} />}
                    </StyledNameTypography>
                    {doc ? (
                      developerHandle && (
                        <StyledDeveloperArea>
                          <StyledDeveloperTypography variant="body2">
                            {`${developerPrefix} `}
                          </StyledDeveloperTypography>
                          <StyledDeveloperLink
                            variant="body2"
                            href={developerLink}
                          >
                            {developerHandle}
                          </StyledDeveloperLink>
                        </StyledDeveloperArea>
                      )
                    ) : (
                      <StyledDeveloperTypography variant="body2">
                        <Skeleton width={80} />
                      </StyledDeveloperTypography>
                    )}
                  </StyledHeaderTextArea>
                  {!edit && (
                    <StyledHeaderButtonArea
                      style={{
                        paddingRight:
                          breakpoint <= Breakpoint.sm ? 0 : undefined,
                        justifyContent:
                          breakpoint >= Breakpoint.lg ? "flex-end" : undefined,
                      }}
                    >
                      <Divider absolute />
                      <StyledHeaderButtonAreaContent
                        style={{
                          maxWidth:
                            breakpoint >= Breakpoint.lg ? 300 : undefined,
                        }}
                      >
                        <StyledEngagementButton onClick={handleLike}>
                          <FontIcon
                            aria-label="Likes"
                            color={theme.colors.black50}
                            size={theme.fontSize.smallerIcon}
                          >
                            {isLiked ? (
                              <ThumbsUpSolidIcon />
                            ) : (
                              <ThumbsUpRegularIcon />
                            )}
                          </FontIcon>
                          <StyledEngagementButtonTypography variant="button">
                            {doc
                              ? abbreviateCount(likesCount + (isLiked ? 1 : 0))
                              : "..."}
                          </StyledEngagementButtonTypography>
                        </StyledEngagementButton>
                        <StyledEngagementButton onClick={handleDislike}>
                          <FontIcon
                            aria-label="Dislikes"
                            color={theme.colors.black50}
                            size={theme.fontSize.smallerIcon}
                          >
                            {isDisliked ? (
                              <ThumbsDownSolidIcon />
                            ) : (
                              <ThumbsDownRegularIcon />
                            )}
                          </FontIcon>
                          <StyledEngagementButtonTypography variant="button">
                            {doc
                              ? abbreviateCount(
                                  dislikesCount + (isDisliked ? 1 : 0)
                                )
                              : "..."}
                          </StyledEngagementButtonTypography>
                        </StyledEngagementButton>
                        <StyledEngagementButton onClick={onShare}>
                          <FontIcon
                            aria-label="Share"
                            color={theme.colors.black50}
                            size={theme.fontSize.smallerIcon}
                          >
                            <ShareRegularIcon />
                          </FontIcon>
                          <StyledEngagementButtonTypography variant="button">
                            {`Share`}
                          </StyledEngagementButtonTypography>
                        </StyledEngagementButton>
                        <StyledEngagementButton onClick={handleFollow}>
                          <FontIcon
                            aria-label="Follow"
                            color={theme.colors.black50}
                            size={theme.fontSize.smallerIcon}
                          >
                            {isFollowed ? (
                              <BellSolidIcon />
                            ) : (
                              <BellRegularIcon />
                            )}
                          </FontIcon>
                          <StyledEngagementButtonTypography variant="button">
                            {`Follow`}
                          </StyledEngagementButtonTypography>
                        </StyledEngagementButton>
                      </StyledHeaderButtonAreaContent>
                    </StyledHeaderButtonArea>
                  )}
                </StyledHeaderArea>
                <PageContent
                  doc={doc}
                  edit={edit}
                  preview={preview}
                  playerAspectRatio={playerAspectRatio}
                  breakpoint={breakpoint}
                  images={screenshotImages}
                  placeholders={placeholders}
                  liked={isLiked}
                  disliked={isDisliked}
                  onStorageError={handleStorageError}
                  onDebouncedPropertyChange={onDebouncedPropertyChange}
                  onAction={onAction}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  onPostComment={onPostComment}
                  getPublicUrl={getPublicUrl}
                  getPlaceholderUrl={getPlaceholderUrl}
                />
              </StyledContentArea>
            )}
          </StyledPaper>
        </StyledPaperBackgroundContainer>
      </StyledPageLayout>
    </StyledPage>
  );
});

export default Page;
