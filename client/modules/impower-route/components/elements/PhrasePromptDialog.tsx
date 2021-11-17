import { DragEndEvent } from "@dnd-kit/core";
import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import { DialogProps } from "@material-ui/core/Dialog";
import Divider from "@material-ui/core/Divider";
import IconButton from "@material-ui/core/IconButton";
import Paper, { PaperProps } from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import useMediaQuery from "@material-ui/core/useMediaQuery";
import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import AngleLeftRegularIcon from "../../../../resources/icons/regular/angle-left.svg";
import AngleRightRegularIcon from "../../../../resources/icons/regular/angle-right.svg";
import CircleQuestionRegularIcon from "../../../../resources/icons/regular/circle-question.svg";
import EllipsisVerticalRegularIcon from "../../../../resources/icons/regular/ellipsis-vertical.svg";
import PencilRegularIcon from "../../../../resources/icons/regular/pencil.svg";
import ThumbsDownRegularIcon from "../../../../resources/icons/regular/thumbs-down.svg";
import ThumbsUpRegularIcon from "../../../../resources/icons/regular/thumbs-up.svg";
import ThumbsDownSolidIcon from "../../../../resources/icons/solid/thumbs-down.svg";
import ThumbsUpSolidIcon from "../../../../resources/icons/solid/thumbs-up.svg";
import { capitalize, ConfigContext } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import {
  DislikeReason,
  getDataStoreKey,
  PhraseDocument,
  SuggestionDocument,
} from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import { DynamicIcon, FontIcon } from "../../../impower-icon";
import { VirtualizedItem } from "../../../impower-react-virtualization";
import { ToastContext, toastTop } from "../../../impower-toast";
import {
  UserContext,
  userDoDislike,
  userDoLike,
  userOnCreateSubmission,
  userOnUpdateSubmission,
  userUndoDislike,
  userUndoLike,
} from "../../../impower-user";
import ScaleAnimation from "../animations/ScaleAnimation";
import ContextMenu from "../popups/ContextMenu";
import HelpDialog from "./HelpDialog";
import PhraseExplanationDialog from "./PhraseExplanationDialog";
import PhraseReportDialog from "./PhraseReportDialog";
import PhraseSuggestionDialog from "./PhraseSuggestionDialog";
import SortableList from "./SortableList";

const StyledPaper = styled(Paper)``;

const StyledTitleTypography = styled(Typography)`
  text-align: center;
  padding: ${(props): string => props.theme.spacing(1)};
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  margin-bottom: ${(props): string => props.theme.spacing(1)};
  user-select: none;
`;

const StyledTagArea = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledTagChip = styled(Button)<{ off?: boolean }>`
  padding: ${(props): string => props.theme.spacing(0.5, 2.25)};
  border-radius: ${(props): string => props.theme.spacing(3)};
  text-transform: none;
`;

const StyledChipIconArea = styled.div`
  padding-right: ${(props): string => props.theme.spacing(1)};
`;

const StyledPhrasesArea = styled.div`
  display: flex;
  flex-direction: column;
`;

const StyledPhraseArea = styled.div`
  position: relative;
  border-radius: ${(props): string => props.theme.spacing(1)};
  display: flex;
`;

const StyledPhraseButton = styled(Button)`
  text-transform: none;
  padding: ${(props): string => props.theme.spacing(1.5, 1)};
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  user-select: none;
  touch-callout: none;
`;

const StyledPhraseTypography = styled(Typography)`
  text-align: center;
`;

const StyledDirectionsTypography = styled(Typography)`
  padding: ${(props): string => props.theme.spacing(1.5, 1)};
  text-align: center;
`;

const StyledDivider = styled(Divider)`
  background-color: ${(props): string => props.theme.colors.white10};
  margin: ${(props): string => props.theme.spacing(2, 0)};
`;

const StyledSuggestButton = styled(Button)`
  margin-top: ${(props): string => props.theme.spacing(3)};
  margin-bottom: ${(props): string => props.theme.spacing(1)};
  padding: ${(props): string => props.theme.spacing(1.5, 1)};
  border-radius: ${(props): string => props.theme.spacing(10)};
  max-height: ${(props): string => props.theme.spacing(7)};
  will-change: opacity;
`;

const StyledVoteHelpArea = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: ${(props): string => props.theme.spacing(2)};
  margin-left: -${(props): string => props.theme.spacing(1)};
  margin-right: -${(props): string => props.theme.spacing(1)};

  margin-bottom: -${(props): string => props.theme.spacing(2)};

  ${(props): string => props.theme.breakpoints.down("md")} {
    margin-bottom: 0;
  }
`;

const StyledVoteHelpButton = styled(Button)`
  text-transform: none;
  padding: 0;
`;

const StyledVoteHelpContent = styled.div`
  padding: ${(props): string => props.theme.spacing(1)};
`;

const StyledTipsArea = styled.div`
  display: flex;
  flex-direction: column;
  color: ${(props): string => props.theme.palette.secondary.light};
`;

const StyledTipTypography = styled(Typography)`
  padding: ${(props): string => props.theme.spacing(0.5, 0)};
`;

const StyledBoldTipTypography = styled(StyledTipTypography)`
  font-weight: 700;
`;

const StyledCaptionTypography = styled(Typography)`
  font-weight: ${(props): number => props.theme.fontWeight.semiBold};
  line-height: 1.75;
  text-align: right;
`;

const StyledVoteArea = styled(ScaleAnimation)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  display: flex;
  justify-content: center;
  align-items: center;

  margin-left: ${(props): string => props.theme.spacing(-4.5)};
  width: ${(props): string => props.theme.spacing(4)};
`;

const StyledIconButton = styled(IconButton)``;

const StyledOptionsIconButton = styled(IconButton)`
  position: absolute;
  top: 0;
  bottom: 0;
  right: ${(props): string => props.theme.spacing(-4.5)};
`;

const StyledTagTypography = styled(Typography)`
  color: white;
  white-space: nowrap;
`;

const TipsArea = React.memo(() => {
  const [voteInstructionsVisible, setVoteInstructionsVisible] = useState(false);
  const handleShowVoteInstructions = useCallback(() => {
    setVoteInstructionsVisible(true);
  }, []);

  return (
    <StyledTipsArea>
      <StyledBoldTipTypography>{`Not seeing suggestions you like?`}</StyledBoldTipTypography>
      <StyledTipTypography>{`Try dragging or tapping the tags at the top to change which ones should influence the A.I. the most`}</StyledTipTypography>
      <StyledVoteHelpArea>
        {voteInstructionsVisible ? (
          <StyledVoteHelpContent>
            <StyledCaptionTypography variant="caption">{`Click the options button to the right of a phrase to like or dislike the suggestion!`}</StyledCaptionTypography>
          </StyledVoteHelpContent>
        ) : (
          <StyledVoteHelpButton
            size="small"
            color="inherit"
            onClick={handleShowVoteInstructions}
          >
            <StyledVoteHelpContent>
              <StyledCaptionTypography variant="body2">{`(You can help make our A.I. smarter)`}</StyledCaptionTypography>
            </StyledVoteHelpContent>
          </StyledVoteHelpButton>
        )}
      </StyledVoteHelpArea>
    </StyledTipsArea>
  );
});

interface SuggestButtonProps {
  onClick?: (e: React.MouseEvent) => void;
}

const SuggestButton = React.memo((props: SuggestButtonProps) => {
  const { onClick } = props;
  return (
    <StyledSuggestButton
      size="large"
      variant="outlined"
      color="inherit"
      fullWidth
      onClick={onClick}
    >
      {`Suggest A Phrase`}
    </StyledSuggestButton>
  );
});

interface DraggableTagProps {
  off?: boolean;
  tag?: string;
  tagIconName?: string;
}

const DraggableTag = React.memo((props: DraggableTagProps) => {
  const { off, tag, tagIconName } = props;
  const theme = useTheme();
  const style = useMemo(
    () => ({
      boxShadow: "none",
      opacity: off ? 0.5 : undefined,
      backgroundColor: off
        ? theme.palette.primary.dark
        : theme.palette.secondary.main,
      transition: "none",
    }),
    [off, theme.palette.primary.dark, theme.palette.secondary.main]
  );
  return (
    <StyledTagArea>
      <StyledTagChip variant="contained" color="secondary" style={style}>
        <StyledChipIconArea>
          <FontIcon aria-label={tag} color={theme.colors.white80} size={15}>
            <DynamicIcon icon={tagIconName} />
          </FontIcon>
        </StyledChipIconArea>
        <StyledTagTypography variant="body2">
          {capitalize(tag)}
        </StyledTagTypography>
      </StyledTagChip>
    </StyledTagArea>
  );
});

interface SortableTagsAreaProps {
  sortedTags?: string[];
  currentSelectedTags?: string[];
  tagIconNames: {
    [tag: string]: string;
  };
  onReorder?: (event: DragEndEvent, order: string[]) => void;
  onClickTag?: (tag: string) => void;
}

const SortableTagsArea = React.memo((props: SortableTagsAreaProps) => {
  const {
    sortedTags,
    currentSelectedTags,
    tagIconNames,
    onReorder,
    onClickTag,
  } = props;

  const theme = useTheme();

  const handleClick = useCallback(
    (id: string) => {
      if (onClickTag) {
        onClickTag(id);
      }
    },
    [onClickTag]
  );

  return (
    <SortableList
      direction="responsive"
      items={sortedTags}
      scrollLeftIcon={
        <FontIcon
          aria-label={`Scroll Left`}
          color={theme.colors.white50}
          size={24}
        >
          <AngleLeftRegularIcon />
        </FontIcon>
      }
      scrollRightIcon={
        <FontIcon
          aria-label={`Scroll Right`}
          color={theme.colors.white50}
          size={24}
        >
          <AngleRightRegularIcon />
        </FontIcon>
      }
      onReorder={onReorder}
      onClick={handleClick}
    >
      {({ id }): JSX.Element => {
        const mainTag = id || "";
        const tagIconName = tagIconNames?.[mainTag] || "hashtag";
        return (
          <DraggableTag
            tag={id}
            tagIconName={tagIconName}
            off={!currentSelectedTags.includes(id)}
          />
        );
      }}
    </SortableList>
  );
});

interface PhraseButtonProps {
  scrollParent?: HTMLElement;
  index: number;
  selected?: boolean;
  phrase?: string;
  liked?: boolean;
  disliked?: boolean;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent, phrase: string) => void;
  onUnlike?: (e: React.MouseEvent, phrase: string) => Promise<void>;
  onUndislike?: (e: React.MouseEvent, phrase: string) => Promise<void>;
  onOption?: (e: React.MouseEvent, option: string, phrase: string) => void;
}

const PhraseButton = React.memo((props: PhraseButtonProps) => {
  const {
    scrollParent,
    index,
    selected,
    phrase,
    liked,
    disliked,
    style,
    onClick,
    onUnlike,
    onUndislike,
    onOption,
  } = props;

  const options = useMemo(
    () => [
      {
        key: "like",
        label: "Great!",
        icon: liked ? <ThumbsUpSolidIcon /> : <ThumbsUpRegularIcon />,
      },
      {
        key: "dislike",
        label: "Try again.",
        icon: disliked ? <ThumbsDownSolidIcon /> : <ThumbsDownRegularIcon />,
      },
      {
        key: "why",
        label: "Why?",
        icon: <CircleQuestionRegularIcon />,
      },
      {
        key: "edit",
        label: "Suggest an edit",
        icon: <PencilRegularIcon />,
      },
    ],
    [liked, disliked]
  );

  const [contextMenuOpen, setContextMenuOpen] = useState<boolean>();
  const [contextMenuAnchorEl, setContextAnchorEl] = useState<HTMLElement>();

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.m !== prevState?.m) {
        setContextMenuOpen(currState?.m === phrase);
      }
    },
    [phrase]
  );
  const [openMenuDialog, closeMenuDialog] = useDialogNavigation(
    "m",
    handleBrowserNavigation
  );

  const handleContextOpen = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenuOpen(true);
      setContextAnchorEl(e.currentTarget as HTMLElement);
      openMenuDialog(phrase);
    },
    [openMenuDialog, phrase]
  );

  const handleContextClose = useCallback(() => {
    setContextMenuOpen(false);
    closeMenuDialog();
  }, [closeMenuDialog]);

  const theme = useTheme();

  const voteLabel = liked
    ? "Remove like"
    : disliked
    ? "Remove dislike"
    : undefined;
  const voteIcon = liked ? (
    <ThumbsUpSolidIcon />
  ) : disliked ? (
    <ThumbsDownSolidIcon />
  ) : undefined;

  const voteIconRef = useRef(voteIcon);

  if (voteIcon) {
    voteIconRef.current = voteIcon;
  }

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (onClick) {
        onClick(e, phrase);
      }
    },
    [onClick, phrase]
  );

  const handleUnlikePhrase = useCallback(
    (e: React.MouseEvent) => {
      if (onUnlike) {
        onUnlike(e, phrase);
      }
    },
    [onUnlike, phrase]
  );

  const handleUndislikePhrase = useCallback(
    (e: React.MouseEvent) => {
      if (onUndislike) {
        onUndislike(e, phrase);
      }
    },
    [onUndislike, phrase]
  );

  const handleOption = useCallback(
    (e: React.MouseEvent, option: string) => {
      if (onOption) {
        onOption(e, option, phrase);
      }
    },
    [onOption, phrase]
  );

  const handleVote = liked
    ? handleUnlikePhrase
    : disliked
    ? handleUndislikePhrase
    : undefined;

  const phraseAreaStyle: React.CSSProperties = useMemo(
    () => ({
      backgroundColor: selected ? theme.colors.white05 : undefined,
      ...style,
    }),
    [selected, style, theme.colors.white05]
  );

  const mountIfVisibleStyle: React.CSSProperties = useMemo(
    () => ({
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }),
    []
  );

  return (
    <VirtualizedItem
      root={scrollParent}
      index={index}
      minHeight={48}
      dontUnmount
      style={mountIfVisibleStyle}
    >
      <StyledPhraseArea style={phraseAreaStyle}>
        <StyledVoteArea initial={0} animate={handleVote ? 1 : 0} duration={0.1}>
          <StyledIconButton onClick={handleVote}>
            <FontIcon
              aria-label={voteLabel}
              color={theme.colors.subtitle}
              size={16}
            >
              {voteIconRef.current}
            </FontIcon>
          </StyledIconButton>
        </StyledVoteArea>
        <StyledPhraseButton
          onClick={handleClick}
          onContextMenu={handleContextOpen}
          color="inherit"
          fullWidth
        >
          <StyledPhraseTypography>{phrase}</StyledPhraseTypography>
        </StyledPhraseButton>
        <StyledOptionsIconButton onClick={handleContextOpen}>
          <FontIcon
            aria-label={`Options`}
            color={theme.colors.subtitle}
            size={16}
          >
            <EllipsisVerticalRegularIcon />
          </FontIcon>
        </StyledOptionsIconButton>
        <ContextMenu
          anchorReference="anchorEl"
          anchorEl={contextMenuAnchorEl}
          open={contextMenuOpen}
          options={options}
          onOption={handleOption}
          onClose={handleContextClose}
        />
      </StyledPhraseArea>
    </VirtualizedItem>
  );
});

interface PhraseListProps {
  scrollParent?: HTMLElement;
  relevantTitles?: string[];
  selectedTitle?: string;
  onClickPhrase?: (e: React.MouseEvent, phrase: string) => void;
  onUnlike?: (e: React.MouseEvent, phrase: string) => Promise<void>;
  onUndislike?: (e: React.MouseEvent, phrase: string) => Promise<void>;
  onOption?: (e: React.MouseEvent, option: string, phrase: string) => void;
}

const PhraseList = React.memo((props: PhraseListProps) => {
  const {
    scrollParent,
    relevantTitles,
    selectedTitle,
    onClickPhrase,
    onUnlike,
    onUndislike,
    onOption,
  } = props;

  const [userState] = useContext(UserContext);
  const { my_likes, my_dislikes } = userState;

  return (
    <>
      {Array.from({ length: relevantTitles.length }, (v, k) => k).map(
        (index) => {
          const title = relevantTitles[index];
          return (
            <PhraseButton
              key={index}
              scrollParent={scrollParent}
              index={index}
              phrase={title}
              liked={Boolean(my_likes?.[getDataStoreKey("phrases", title)])}
              disliked={Boolean(
                my_dislikes?.[getDataStoreKey("phrases", title)]
              )}
              onClick={onClickPhrase}
              onUnlike={onUnlike}
              onUndislike={onUndislike}
              onOption={onOption}
              selected={title === selectedTitle}
            />
          );
        }
      )}
    </>
  );
});

const HelpDialogPaper = React.memo((props: PaperProps) => {
  const handleContextOpen = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);
  return <StyledPaper onContextMenu={handleContextOpen} {...props} />;
});

interface PhrasePromptDialogProps extends Omit<DialogProps, "title"> {
  open: boolean;
  chosenTitle?: string;
  sortedTags?: string[];
  relevancyFilteredTags?: string[];
  relevantTitles?: string[];
  terms?: { [term: string]: string[] };
  onChooseTitle?: (title: string) => void;
  onRelevancyFilter?: (filteredTags: string[]) => void;
  onAddPhrase?: (phrase: string, tags: string[]) => void;
  onDeletePhrase?: (phrase: string, tags: string[]) => void;
  onEditPhrase?: (original: string, phrase: string) => void;
  onChangeTags?: (tags: string[]) => void;
  onClose?: () => void;
}

const PhrasePromptDialog = React.memo((props: PhrasePromptDialogProps) => {
  const {
    open,
    chosenTitle,
    sortedTags,
    relevancyFilteredTags,
    relevantTitles,
    terms,
    onChooseTitle,
    onRelevancyFilter,
    onAddPhrase,
    onDeletePhrase,
    onEditPhrase,
    onChangeTags,
    onClose,
    ...other
  } = props;

  const [configState] = useContext(ConfigContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { uid, my_likes, my_dislikes } = userState;
  const [, toastDispatch] = useContext(ToastContext);

  const theme = useTheme();

  const [scrollParent, setScrollParent] = useState<HTMLElement>();
  const [dialogOpenKey, setDialogOpenKey] = useState<
    "suggest" | "report" | "explain"
  >();
  const [defaultPhraseSuggestion, setDefaultPhraseSuggestion] = useState("");
  const [reportingPhrase, setReportingPhrase] = useState("");
  const [explanationPhrase, setExplanationPhrase] = useState("");

  const suggestionDialogOpen = dialogOpenKey === "suggest";
  const reportDialogOpen = dialogOpenKey === "report";
  const explanationDialogOpen = dialogOpenKey === "explain";

  const currentSelectedTags = useMemo(
    () =>
      sortedTags.filter((tag) => !(relevancyFilteredTags || []).includes(tag)),
    [sortedTags, relevancyFilteredTags]
  );

  const [openAccountDialog] = useDialogNavigation("a");

  const handleBrowserNavigation = useCallback(
    (currState: Record<string, string>, prevState?: Record<string, string>) => {
      if (currState?.i !== prevState?.i) {
        setDialogOpenKey(
          (currState?.i as "suggest" | "report" | "explain") || null
        );
      }
    },
    []
  );
  const [openInfoDialog, closeInfoDialog] = useDialogNavigation(
    "i",
    handleBrowserNavigation
  );

  const handleCloseExplanationDialog = useCallback((): void => {
    setDialogOpenKey(null);
    closeInfoDialog();
  }, [closeInfoDialog]);

  const handleCloseSuggestionDialog = useCallback((): void => {
    setDialogOpenKey(null);
    closeInfoDialog();
  }, [closeInfoDialog]);

  const handleCloseReportDialog = useCallback((): void => {
    setDialogOpenKey(null);
    closeInfoDialog();
  }, [closeInfoDialog]);

  const handleClickTag = useCallback(
    (tag: string) => {
      const newFilteredTags = relevancyFilteredTags?.includes(tag)
        ? relevancyFilteredTags.filter((t) => t !== tag)
        : [...(relevancyFilteredTags || []), tag];
      if (onRelevancyFilter) {
        onRelevancyFilter(newFilteredTags);
      }
    },
    [relevancyFilteredTags, onRelevancyFilter]
  );

  const handleEnter = useCallback(() => {
    setDialogOpenKey(null);
    setDefaultPhraseSuggestion("");
    setReportingPhrase("");
    setExplanationPhrase("");
  }, []);

  const handleSuggestNewPhrase = useCallback(() => {
    if (!uid) {
      openAccountDialog("signup");
      return;
    }
    setDefaultPhraseSuggestion("");
    setDialogOpenKey("suggest");
    openInfoDialog("suggest");
  }, [openAccountDialog, openInfoDialog, uid]);

  const handleClickPhrase = useCallback(
    (e: React.MouseEvent, phrase: string) => {
      if (onChooseTitle) {
        onChooseTitle(phrase);
      }
    },
    [onChooseTitle]
  );

  const handleUnlikePhrase = useCallback(
    async (e: React.MouseEvent, phrase: string) => {
      if (!uid) {
        openAccountDialog("signup");
        return;
      }
      const needsDelete = my_likes?.[getDataStoreKey("phrases", phrase)];
      if (needsDelete) {
        try {
          userDispatch(userUndoLike("phrases", phrase));
        } catch (error) {
          const logError = (
            await import("../../../impower-logger/utils/logError")
          ).default;
          logError(error);
          toastDispatch(toastTop("Vote could not be submitted", "error"));
        }
      }
    },
    [uid, my_likes, openAccountDialog, userDispatch, toastDispatch]
  );

  const handleUndislikePhrase = useCallback(
    async (e: React.MouseEvent, phrase: string) => {
      if (!uid) {
        openAccountDialog("signup");
        return;
      }
      const needsDelete = my_dislikes?.[getDataStoreKey("phrases", phrase)];
      if (needsDelete) {
        try {
          userDispatch(userUndoDislike("phrases", phrase));
        } catch (error) {
          const logError = (
            await import("../../../impower-logger/utils/logError")
          ).default;
          logError(error);
          toastDispatch(toastTop("Vote could not be submitted", "error"));
        }
      }
    },
    [uid, my_dislikes, openAccountDialog, userDispatch, toastDispatch]
  );

  const handleLikePhrase = useCallback(
    async (e: React.MouseEvent, phrase: string) => {
      if (!uid) {
        openAccountDialog("signup");
        return;
      }
      try {
        handleUndislikePhrase(e, phrase);
        userDispatch(userDoLike("phrases", phrase));
      } catch (error) {
        const logError = (
          await import("../../../impower-logger/utils/logError")
        ).default;
        logError(error);
        toastDispatch(toastTop("Vote could not be submitted", "error"));
      }
    },
    [uid, openAccountDialog, handleUndislikePhrase, userDispatch, toastDispatch]
  );

  const handleDislikePhrase = useCallback(
    (e: React.MouseEvent, phrase: string) => {
      if (!uid) {
        openAccountDialog("signup");
        return;
      }
      setReportingPhrase(phrase);
      setDialogOpenKey("report");
      openInfoDialog("report");
    },
    [openAccountDialog, openInfoDialog, uid]
  );

  const handleSubmitReport = useCallback(
    async (e: React.MouseEvent, reason: string, personalize: boolean) => {
      if (!uid) {
        openAccountDialog("signup");
        return;
      }
      try {
        handleUnlikePhrase(e, reportingPhrase);
        userDispatch(userDoDislike("phrases", reportingPhrase));
        const createSuggestionDocument = (
          await import(
            "../../../impower-data-store/utils/createSuggestionDocument"
          )
        ).default;
        await new Promise<void>((resolve) =>
          userDispatch(
            userOnCreateSubmission(
              resolve,
              createSuggestionDocument({
                reason,
                tags: sortedTags,
                selectedTags: currentSelectedTags,
              }),
              "phrases",
              reportingPhrase,
              "suggestions",
              uid
            )
          )
        );
        handleCloseReportDialog();
        if (personalize) {
          if (onDeletePhrase) {
            onDeletePhrase(
              reportingPhrase,
              reason === DislikeReason.Irrelevant
                ? currentSelectedTags
                : undefined
            );
          }
        }
        toastDispatch(toastTop("Report sent!", "success"));
      } catch (error) {
        const logError = (
          await import("../../../impower-logger/utils/logError")
        ).default;
        logError(error);
        toastDispatch(toastTop("Vote could not be submitted", "error"));
      }
    },
    [
      uid,
      openAccountDialog,
      handleUnlikePhrase,
      reportingPhrase,
      userDispatch,
      handleCloseReportDialog,
      toastDispatch,
      sortedTags,
      currentSelectedTags,
      onDeletePhrase,
    ]
  );

  const handleSubmitSuggestion = useCallback(
    async (phraseSuggestion: string, personalize: boolean): Promise<string> => {
      try {
        const originalPhrase = defaultPhraseSuggestion;
        const suggestedPhrase = phraseSuggestion;
        const isSuggestingANewPhrase = Boolean(!originalPhrase);
        const DataStoreRead = (
          await import("../../../impower-data-store/classes/dataStoreRead")
        ).default;
        const phraseSnapshot = await new DataStoreRead(
          "phrases",
          suggestedPhrase
        ).get<PhraseDocument>();
        const data = phraseSnapshot.data();
        if (isSuggestingANewPhrase) {
          if (phraseSnapshot.exists()) {
            if (data.approved) {
              return "Phrase already exists";
            }
            if (data?._createdBy === uid) {
              return "Phrase has already been submitted and is awaiting approval";
            }
          } else {
            const createPhraseDocument = (
              await import(
                "../../../impower-data-store/utils/createPhraseDocument"
              )
            ).default;
            await new Promise<void>((resolve) =>
              userDispatch(
                userOnCreateSubmission(
                  resolve,
                  createPhraseDocument({}),
                  "phrases",
                  suggestedPhrase
                )
              )
            );
          }
        }
        const phraseSuggestionSnapshot = await new DataStoreRead(
          "phrases",
          originalPhrase || suggestedPhrase,
          "suggestions",
          uid
        ).get<SuggestionDocument>();
        if (phraseSuggestionSnapshot.exists()) {
          const createSuggestionDocument = (
            await import(
              "../../../impower-data-store/utils/createSuggestionDocument"
            )
          ).default;
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnUpdateSubmission(
                resolve,
                createSuggestionDocument({
                  edit: suggestedPhrase,
                  tags: sortedTags,
                  selectedTags: currentSelectedTags,
                }),
                "phrases",
                originalPhrase || suggestedPhrase,
                "suggestions",
                uid
              )
            )
          );
        } else {
          const createSuggestionDocument = (
            await import(
              "../../../impower-data-store/utils/createSuggestionDocument"
            )
          ).default;
          await new Promise<void>((resolve) =>
            userDispatch(
              userOnCreateSubmission(
                resolve,
                createSuggestionDocument({
                  edit: suggestedPhrase,
                  tags: sortedTags,
                  selectedTags: currentSelectedTags,
                }),
                "phrases",
                originalPhrase || suggestedPhrase,
                "suggestions",
                uid
              )
            )
          );
        }
        handleCloseSuggestionDialog();
        if (personalize) {
          if (isSuggestingANewPhrase) {
            if (onAddPhrase) {
              onAddPhrase(suggestedPhrase, currentSelectedTags);
            }
          } else if (onEditPhrase) {
            onEditPhrase(originalPhrase, suggestedPhrase);
          }
        }
        toastDispatch(toastTop("Submitted Suggestion!", "success"));
        return undefined;
      } catch (error) {
        const logError = (
          await import("../../../impower-logger/utils/logError")
        ).default;
        logError(error);
        toastDispatch(toastTop("Suggestion could not be sent", "error"));
        return undefined;
      }
    },
    [
      defaultPhraseSuggestion,
      uid,
      handleCloseSuggestionDialog,
      toastDispatch,
      userDispatch,
      sortedTags,
      currentSelectedTags,
      onEditPhrase,
      onAddPhrase,
    ]
  );

  const handleExplainPhrase = useCallback(
    (phrase: string) => {
      setExplanationPhrase(phrase);
      setDialogOpenKey("explain");
      openInfoDialog("explain");
    },
    [openInfoDialog]
  );

  const handleEditPhrase = useCallback(
    (phrase: string) => {
      if (!uid) {
        openAccountDialog("signup");
        return;
      }
      setDefaultPhraseSuggestion(phrase);
      setDialogOpenKey("suggest");
      openInfoDialog("suggest");
    },
    [openAccountDialog, openInfoDialog, uid]
  );

  const handlePhraseOption = useCallback(
    async (e: React.MouseEvent, option: string, phrase: string) => {
      if (option === "like") {
        if (my_likes?.[getDataStoreKey("phrases", phrase)]) {
          handleUnlikePhrase(e, phrase);
        } else {
          handleLikePhrase(e, phrase);
        }
      }
      if (option === "dislike") {
        if (my_dislikes?.[getDataStoreKey("phrases", phrase)]) {
          handleUndislikePhrase(e, phrase);
        } else {
          handleDislikePhrase(e, phrase);
        }
      }
      if (option === "why") {
        handleExplainPhrase(phrase);
      }
      if (option === "edit") {
        handleEditPhrase(phrase);
      }
    },
    [
      my_likes,
      my_dislikes,
      handleDislikePhrase,
      handleEditPhrase,
      handleExplainPhrase,
      handleLikePhrase,
      handleUndislikePhrase,
      handleUnlikePhrase,
    ]
  );

  const handleReorderTags = useCallback(
    (e: DragEndEvent, tags: string[]) => {
      if (onChangeTags) {
        onChangeTags(tags);
      }
    },
    [onChangeTags]
  );

  const belowSmBreakpoint = useMediaQuery(theme.breakpoints.down("md"));

  const PaperProps = useMemo(
    () => ({
      style: {
        minHeight: belowSmBreakpoint ? "100%" : `calc(100% - 64px)`,
      },
    }),
    [belowSmBreakpoint]
  );

  const tagIconNames =
    configState?.tagIconNames || ConfigCache.instance.params?.tagIconNames;

  const DialogTransitionProps = useMemo(
    () => ({ onEnter: handleEnter }),
    [handleEnter]
  );

  const handleScrollRef = useCallback((instance: HTMLDivElement) => {
    if (instance) {
      setScrollParent(instance);
    }
  }, []);

  return (
    <>
      <HelpDialog
        open={open}
        scrollRef={handleScrollRef}
        PaperProps={PaperProps}
        onClose={onClose}
        PaperComponent={HelpDialogPaper}
        TransitionProps={DialogTransitionProps}
        {...other}
      >
        <StyledTitleTypography variant="h5">{`Title Suggestions`}</StyledTitleTypography>
        <SortableTagsArea
          sortedTags={sortedTags}
          currentSelectedTags={currentSelectedTags}
          tagIconNames={tagIconNames}
          onReorder={handleReorderTags}
          onClickTag={handleClickTag}
        />
        <StyledDivider />
        <StyledPhrasesArea>
          {!relevantTitles ? null : relevantTitles.length === 0 &&
            sortedTags?.length > 0 &&
            relevancyFilteredTags?.length > 0 ? (
            <StyledDirectionsTypography>
              {`(Click a tag to view relevant titles)`}
            </StyledDirectionsTypography>
          ) : (
            <PhraseList
              scrollParent={scrollParent}
              relevantTitles={relevantTitles}
              selectedTitle={chosenTitle}
              onClickPhrase={handleClickPhrase}
              onUnlike={handleUnlikePhrase}
              onUndislike={handleUndislikePhrase}
              onOption={handlePhraseOption}
            />
          )}
          <SuggestButton onClick={handleSuggestNewPhrase} />
        </StyledPhrasesArea>
        <StyledDivider />
        <TipsArea />
      </HelpDialog>
      <PhraseExplanationDialog
        open={explanationDialogOpen}
        phrase={explanationPhrase}
        terms={terms}
        tags={sortedTags}
        onClose={handleCloseExplanationDialog}
      />
      <PhraseSuggestionDialog
        open={suggestionDialogOpen}
        defaultSuggestion={defaultPhraseSuggestion}
        tags={sortedTags}
        selectedTags={currentSelectedTags}
        onSubmit={handleSubmitSuggestion}
        onClose={handleCloseSuggestionDialog}
      />
      <PhraseReportDialog
        open={reportDialogOpen}
        phrase={reportingPhrase}
        tags={sortedTags}
        selectedTags={currentSelectedTags}
        onSubmit={handleSubmitReport}
        onClose={handleCloseReportDialog}
      />
    </>
  );
});

export default PhrasePromptDialog;
