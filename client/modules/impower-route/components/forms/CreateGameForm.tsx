import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { Slider, Typography } from "@material-ui/core";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ConfigContext,
  getRandomizedTags,
  getTagsSortedBySpecificity,
} from "../../../impower-config";
import { difference } from "../../../impower-core";
import {
  GameDocumentInspector,
  ProjectDocument,
} from "../../../impower-data-store";
import { useDialogNavigation } from "../../../impower-dialog";
import {
  getPersonalizedPhraseTagsMap,
  getRelevantPhrases,
  getReversedMap,
} from "../../../impower-terms";
import { ToastContext, toastTop } from "../../../impower-toast";
import {
  UserContext,
  userOnCreateSubmission,
  userSetCustomization,
} from "../../../impower-user";
import { EngineConsoleType, studioConsoles } from "../../types/info/console";
import { RenderPropertyProps } from "../inputs/DataField";
import GameNameField, { GameNameFieldProps } from "../inputs/GameNameField";
import GameSummaryField, {
  GameSummaryFieldProps,
} from "../inputs/GameSummaryField";
import PageTagField, { PageTagFieldProps } from "../inputs/PageTagField";
import RandomizeButton from "../inputs/RandomizeButton";
import { CreationStep } from "./CreateDocumentForm";
import CreatePageForm from "./CreatePageForm";

const defaultSteps: CreationStep[] = [
  {
    title: "Create a game",
    description: "What kind of game would you like to make?",
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

const inspirationText = "Need some inspiration?";
const randomizeText = "Randomize!";

const StyledTagInspiration = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

const StyledTypography = styled(Typography)`
  font-size: 0.9375rem;
  white-space: nowrap;
`;

const StyledInspirationTextArea = styled.div`
  position: absolute;
  top: -${(props): string => props.theme.spacing(4)};
  left: 0;
  right: 0;
`;

const StyledSliderArea = styled.div`
  position: absolute;
  bottom: ${(props): string => props.theme.spacing(-3.5)};
  left: 0;
  right: 0;
`;

const StyledSlider = styled(Slider)``;

interface TagInspirationProps {
  min: number;
  max: number;
  amount: number;
  disabled?: boolean;
  onChangeAmount: (value: number) => void;
  onClick: () => void;
}

const TagInspiration = React.memo((props: TagInspirationProps): JSX.Element => {
  const { min, max, amount, disabled, onChangeAmount, onClick } = props;
  const theme = useTheme();
  const handleChange = useCallback(
    (e, v): void => {
      onChangeAmount(v);
    },
    [onChangeAmount]
  );
  return (
    <StyledTagInspiration>
      <StyledInspirationTextArea>
        <StyledTypography>{inspirationText}</StyledTypography>
      </StyledInspirationTextArea>
      <RandomizeButton
        disabled={disabled}
        label={randomizeText}
        onClick={onClick}
      />
      <StyledSliderArea>
        <StyledSlider
          value={amount}
          valueLabelDisplay="auto"
          size="small"
          step={1}
          marks
          min={min}
          max={max}
          disabled={disabled}
          onChange={handleChange}
          style={{ padding: theme.spacing(1, 0) }}
        />
      </StyledSliderArea>
    </StyledTagInspiration>
  );
});

interface GameFieldProps
  extends RenderPropertyProps,
    PageTagFieldProps,
    GameNameFieldProps,
    GameSummaryFieldProps {}

export const GameField = (props: GameFieldProps): JSX.Element | null => {
  const { propertyPath } = props;
  if (propertyPath === "tags") {
    return <PageTagField {...props} />;
  }
  if (propertyPath === "name") {
    return <GameNameField {...props} />;
  }
  if (propertyPath === "summary") {
    return <GameSummaryField {...props} />;
  }
  return null;
};

interface CreateGameFormProps {
  docId?: string;
  doc: ProjectDocument;
  steps?: CreationStep[];
  submitLabel?: string;
  preview?: React.ReactNode;
  finishedSummary?: React.ReactNode;
  onClose?: (
    e: React.MouseEvent,
    reason: "backdropClick" | "escapeKeyDown" | "closeButtonClick" | "submitted"
  ) => void;
  onChange?: (doc: ProjectDocument) => void;
  onSubmit?: (
    e: React.FormEvent | React.MouseEvent,
    id: string,
    doc: ProjectDocument
  ) => void;
  onSubmitted?: (id: string, doc: ProjectDocument, successful: boolean) => void;
}

const CreateGameForm = React.memo((props: CreateGameFormProps): JSX.Element => {
  const engineConsole = studioConsoles.find(
    (c) => c.type === EngineConsoleType.Games
  );
  const { skipLabel, backLabel, nextLabel, finishCreationLabel } =
    engineConsole;

  const {
    docId,
    doc,
    steps = defaultSteps,
    submitLabel = finishCreationLabel,
    preview,
    finishedSummary,
    onClose,
    onChange,
    onSubmit,
    onSubmitted,
  } = props;

  const [configState, fetchConfigState] = useContext(ConfigContext);
  const [, toastDispatch] = useContext(ToastContext);
  const [userState, userDispatch] = useContext(UserContext);
  const { customizations, isSignedIn, userDoc } = userState;
  const username = userDoc?.username;
  const icon = userDoc?.icon?.fileUrl;
  const hex = userDoc?.hex;
  const phraseAdditions = customizations?.phrase_additions?.phraseTags;
  const phraseDeletions = customizations?.phrase_deletions?.phraseTags;

  const recentlyRandomizedTags = useRef(new Set<string>());

  const [docIdState, setDocIdState] = useState(docId);
  const [tagCount, setTagCount] = useState(5);
  const [lockedTags, setLockedTags] = useState<string[]>([]);
  const [relevancyFilteredTags, setRelevancyFilteredTags] = useState<string[]>(
    doc?.tags || []
  );
  const [nameEdited, setNameEdited] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const originalDoc = useMemo(() => ({ ...(doc || {}) }), []);

  const [termTagsMap, setTermTagsMap] = useState<{
    [term: string]: string[];
  }>();
  const [phraseTagsMap, setPhraseTagsMap] = useState<{
    [phrase: string]: string[];
  }>();
  const [tagPhrasesMap, setTagPhrasesMap] = useState<{
    [tag: string]: string[];
  }>();
  const [filteredRelevantTitles, setFilteredRelevantTitles] = useState<
    string[]
  >([]);

  useEffect(() => {
    setDocIdState(docId);
  }, [docId]);

  const suggestedTitle = filteredRelevantTitles?.[0] || originalDoc?.name;

  const updateFilteredRelevantTitles = useCallback(
    (
      specificitySortedTags: string[],
      relevancyFilteredTags: string[],
      tagPhrasesMap: {
        [tag: string]: string[];
      }
    ) => {
      window.requestAnimationFrame(() => {
        const relevantTags = specificitySortedTags.filter(
          (tag) => !(relevancyFilteredTags || []).includes(tag)
        );
        const filteredRelevantTitles = getRelevantPhrases(
          relevantTags,
          tagPhrasesMap,
          termTagsMap
        );
        setFilteredRelevantTitles(filteredRelevantTitles);
      });
    },
    [termTagsMap]
  );

  useEffect(() => {
    const setup = async (): Promise<void> => {
      const latestConfigState = await fetchConfigState();
      const getPhraseTagsMap = (
        await import("../../../impower-terms/utils/getPhraseTagsMap")
      ).default;
      const phrases = latestConfigState?.phrases;
      const termTagsMap = latestConfigState?.terms;
      const phraseTagsMap = getPhraseTagsMap(phrases, termTagsMap);
      setTermTagsMap(termTagsMap);
      setTagPhrasesMap(getReversedMap(phraseTagsMap));
      setPhraseTagsMap(phraseTagsMap);
    };
    setup();
  }, [fetchConfigState]);

  useEffect(() => {
    if (phraseTagsMap && phraseAdditions && phraseDeletions) {
      const personalizedPhraseTagsMap = getPersonalizedPhraseTagsMap(
        phraseTagsMap,
        phraseAdditions,
        phraseDeletions
      );
      setTagPhrasesMap(getReversedMap(personalizedPhraseTagsMap));
    }
  }, [phraseTagsMap, phraseAdditions, phraseDeletions]);

  useEffect(() => {
    if (doc?.tags && relevancyFilteredTags && tagPhrasesMap) {
      updateFilteredRelevantTitles(
        doc?.tags,
        relevancyFilteredTags,
        tagPhrasesMap
      );
    }
  }, [
    tagPhrasesMap,
    relevancyFilteredTags,
    doc?.tags,
    updateFilteredRelevantTitles,
  ]);

  const handleAddPhrase = useCallback(
    (phrase: string, tags: string[]) => {
      const newDeletions = { ...phraseDeletions };
      const needsDelete = phraseDeletions?.[phrase];
      const deletionTags = [];
      if (needsDelete) {
        newDeletions[phrase] = deletionTags;
        userDispatch(userSetCustomization(newDeletions, "phrase_deletions"));
      }

      const newAdditions = { ...phraseAdditions };
      const addedTags = phraseAdditions?.[phrase] || [];
      const validTags = tags || [];
      const additionTags = [...addedTags, ...validTags];
      newAdditions[phrase] = additionTags;
      userDispatch(userSetCustomization(newAdditions, "phrase_additions"));

      const personalizedPhraseTagsMap = getPersonalizedPhraseTagsMap(
        phraseTagsMap,
        newAdditions,
        newDeletions
      );
      setTagPhrasesMap(getReversedMap(personalizedPhraseTagsMap));
    },
    [phraseDeletions, phraseAdditions, userDispatch, phraseTagsMap]
  );

  const handleDeletePhrase = useCallback(
    (phrase: string, tags: string[]) => {
      const newDeletions = { ...phraseDeletions };
      const deletedTags = phraseDeletions?.[phrase];
      const validTags = tags || [];
      const deletionTags = deletedTags
        ? Array.from(new Set([...deletedTags, ...validTags]))
        : validTags;
      newDeletions[phrase] = deletionTags;
      userDispatch(userSetCustomization(newDeletions, "phrase_deletions"));

      const personalizedPhraseTagsMap = getPersonalizedPhraseTagsMap(
        phraseTagsMap,
        phraseAdditions,
        newDeletions
      );
      setTagPhrasesMap(getReversedMap(personalizedPhraseTagsMap));
    },
    [phraseDeletions, userDispatch, phraseTagsMap, phraseAdditions]
  );

  const handleEditPhrase = useCallback(
    (original: string, phrase: string) => {
      const newDeletions = { ...phraseDeletions };
      const deletionTags = [];
      newDeletions[original] = deletionTags;
      userDispatch(userSetCustomization(newDeletions, "phrase_deletions"));

      const newAdditions = { ...phraseAdditions };
      const additionTags =
        phraseAdditions?.[original] || phraseTagsMap?.[original];
      newAdditions[phrase] = additionTags;
      userDispatch(userSetCustomization(newAdditions, "phrase_additions"));

      const personalizedPhraseTagsMap = getPersonalizedPhraseTagsMap(
        phraseTagsMap,
        newAdditions,
        newDeletions
      );
      setTagPhrasesMap(getReversedMap(personalizedPhraseTagsMap));
    },
    [phraseDeletions, userDispatch, phraseAdditions, phraseTagsMap]
  );

  const handleChosenTitle = useCallback(
    (name: string) => {
      if (onChange) {
        onChange({ ...doc, name });
      }
    },
    [doc, onChange]
  );

  const handleChangeTags = useCallback(
    (tags: string[]) => {
      if (onChange) {
        onChange({ ...doc, tags });
      }
    },
    [doc, onChange]
  );

  useEffect(() => {
    if (suggestedTitle && !nameEdited) {
      if (onChange) {
        onChange({
          ...doc,
          name: suggestedTitle,
          _author: {
            u: username,
            i: icon,
            h: hex,
          },
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedTitle, username, icon]);

  const handleGetInspector = useCallback(() => {
    return GameDocumentInspector.instance;
  }, []);

  const tagLimit = handleGetInspector().getPropertyListCountLimit("tags", doc);

  const handlePropertyChange = useCallback(
    (propertyPath: string, value: unknown) => {
      if (propertyPath === "tags") {
        const tags = value as string[];
        const newRemovedTags = difference(doc.tags, tags);
        const newAddedTags = difference(tags, doc.tags);
        if (newRemovedTags.length > 0 || newAddedTags.length > 0) {
          const newLockedTags = [
            ...lockedTags.filter((tag) => !newRemovedTags.includes(tag)),
            ...newAddedTags.filter((tag) => !lockedTags.includes(tag)),
          ];
          setLockedTags(newLockedTags);
          if (
            tagCount <= newLockedTags.length &&
            newLockedTags.length < tagLimit
          ) {
            setTagCount(newLockedTags.length + 1);
          }
        }
      }
      if (propertyPath === "name") {
        setNameEdited(true);
      }
    },
    [doc?.tags, lockedTags, tagCount, tagLimit]
  );
  const handleRandomChange = useCallback(
    (newRandomizedTags: string[]) => {
      newRandomizedTags.forEach((tag) => {
        recentlyRandomizedTags.current.add(tag);
      });
      const tags = [...lockedTags, ...newRandomizedTags];
      if (onChange) {
        onChange({
          ...doc,
          tags,
        });
      }
    },
    [doc, lockedTags, onChange]
  );

  const [openAccountDialog] = useDialogNavigation("a");

  const handleSaveDoc = useCallback(
    async (
      e: React.MouseEvent,
      newDocId: string,
      newDoc: ProjectDocument
    ): Promise<boolean> => {
      try {
        if (!isSignedIn) {
          openAccountDialog("signup");
          return false;
        }
        const Auth = (await import("../../../impower-auth/classes/auth"))
          .default;
        setDocIdState(newDocId);
        if (onSubmit) {
          onSubmit(e, newDocId, newDoc);
        }
        const getUniqueSlug = (
          await import("../../../impower-data-store/utils/getUniqueSlug")
        ).default;
        const getRandomColor = (
          await import("../../../impower-core/utils/getRandomColor")
        ).default;
        const slug = await getUniqueSlug(newDocId, "slugs", newDoc.name);
        const tagColorNames = configState?.tagColorNames;
        const colors = configState?.colors;
        const mainTag = newDoc?.tags?.[0] || "";
        const tagColorName = tagColorNames[mainTag] || "";
        const claimedDoc = {
          ...newDoc,
          name: newDoc.name.trim(),
          slug,
          hex: colors[tagColorName] || getRandomColor(),
          owners: [Auth.instance.uid],
        };
        await new Promise<void>((resolve) =>
          userDispatch(
            userOnCreateSubmission(resolve, claimedDoc, "projects", newDocId)
          )
        );
        if (onSubmitted) {
          await onSubmitted(newDocId, claimedDoc, true);
        }
        return true;
      } catch (error) {
        toastDispatch(toastTop(error.message, "error"));
        if (onSubmitted) {
          await onSubmitted(newDocId, newDoc, false);
        }
        return false;
      }
    },
    [
      isSignedIn,
      onSubmit,
      configState?.tagColorNames,
      configState?.colors,
      onSubmitted,
      openAccountDialog,
      userDispatch,
      toastDispatch,
    ]
  );

  const handleRandomizeTags = useCallback(async () => {
    const minTagCount = lockedTags.length + 1;
    const validTagCount = tagCount < minTagCount ? minTagCount : tagCount;
    if (tagCount !== validTagCount) {
      setTagCount(validTagCount);
    }
    let newRandomizedTags = await getRandomizedTags(
      validTagCount,
      lockedTags,
      Array.from(recentlyRandomizedTags.current)
    );
    if (!newRandomizedTags) {
      recentlyRandomizedTags.current.clear();
      newRandomizedTags = await getRandomizedTags(
        validTagCount,
        lockedTags,
        Array.from(recentlyRandomizedTags.current)
      );
    }
    handleRandomChange(getTagsSortedBySpecificity(newRandomizedTags));
  }, [lockedTags, tagCount, handleRandomChange]);

  const handleLockTag = useCallback(
    (tag: string) => {
      if (lockedTags.includes(tag)) {
        const newLockedTags = lockedTags.filter((t) => t !== tag);
        setLockedTags(newLockedTags);
        const newTagCount = newLockedTags.length + 1;
        if (
          newTagCount <= newLockedTags.length &&
          newLockedTags.length < tagLimit
        ) {
          setTagCount(newTagCount);
        }
      } else {
        const newLockedTags = [...lockedTags, tag];
        setLockedTags(newLockedTags);
        const newTagCount = newLockedTags.length + 1;
        if (
          newTagCount <= newLockedTags.length &&
          newLockedTags.length < tagLimit
        ) {
          setTagCount(newTagCount);
        }
      }
    },
    [lockedTags, tagLimit]
  );

  const InspectorRenderPropertyProps: Partial<GameFieldProps> = {
    lockedTags,
    chosenTitle: doc?.name,
    sortedTags: doc?.tags,
    relevancyFilteredTags,
    relevantTitles: filteredRelevantTitles,
    terms: termTagsMap,
    tags: doc?.tags,
    onLockTag: handleLockTag,
    onRelevancyFilter: setRelevancyFilteredTags,
    onChooseTitle: handleChosenTitle,
    onAddPhrase: handleAddPhrase,
    onDeletePhrase: handleDeletePhrase,
    onEditPhrase: handleEditPhrase,
    onChangeTags: handleChangeTags,
  };

  return (
    <CreatePageForm
      steps={steps}
      docId={docIdState}
      doc={doc}
      skipLabel={skipLabel}
      backLabel={backLabel}
      nextLabel={nextLabel}
      doneLabel={submitLabel}
      finishedSummary={finishedSummary}
      preview={preview}
      getInspector={handleGetInspector}
      onChange={onChange}
      onPropertyChange={handlePropertyChange}
      onSubmit={handleSaveDoc}
      onClose={onClose}
      renderProperty={GameField}
      renderPropertyProps={InspectorRenderPropertyProps}
      firstButtons={
        <TagInspiration
          min={lockedTags.length + 1}
          max={tagLimit}
          amount={tagCount}
          disabled={lockedTags.length >= tagLimit}
          onChangeAmount={setTagCount}
          onClick={handleRandomizeTags}
        />
      }
    />
  );
});

export default CreateGameForm;
