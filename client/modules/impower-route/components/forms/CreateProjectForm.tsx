import styled from "@emotion/styled";
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
import format from "../../../impower-config/utils/format";
import { getRandomizedStorySetup } from "../../../impower-config/utils/getRandomizedStorySetup";
import { difference, shuffle } from "../../../impower-core";
import {
  ProjectDocument,
  ProjectDocumentInspector,
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
  userOnUpdateSubmission,
  userSetCustomization,
} from "../../../impower-user";
import { RenderPropertyProps } from "../inputs/DataField";
import PageTagField, { PageTagFieldProps } from "../inputs/PageTagField";
import ProjectGeneratorTagsSelector from "../inputs/ProjectGeneratorTagsSelector";
import ProjectNameField, {
  ProjectNameFieldProps,
} from "../inputs/ProjectNameField";
import ProjectSummaryField, {
  ProjectSummaryFieldProps,
} from "../inputs/ProjectSummaryField";
import ProjectSummaryInspiration from "../inputs/ProjectSummaryInspiration";
import ProjectTagsInspiration from "../inputs/ProjectTagsInspiration";
import { CreationStep } from "./CreateDocumentForm";
import CreatePageForm from "./CreatePageForm";

const skipLabel = "Skip";
const backLabel = "Back";
const nextLabel = "Next";
const finishCreationLabel = "Create";

const StyledSeparator = styled.div`
  flex: 1;
`;

const StyledGeneratorArea = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

interface ProjectFieldProps
  extends RenderPropertyProps,
    PageTagFieldProps,
    ProjectNameFieldProps,
    ProjectSummaryFieldProps {}

export const ProjectField = (props: ProjectFieldProps): JSX.Element | null => {
  const { propertyPath } = props;
  if (propertyPath === "tags") {
    return <PageTagField {...props} />;
  }
  if (propertyPath === "name") {
    return <ProjectNameField {...props} />;
  }
  if (propertyPath === "summary") {
    return <ProjectSummaryField {...props} />;
  }
  return null;
};

interface CreateProjectFormProps {
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

const CreateProjectForm = React.memo(
  (props: CreateProjectFormProps): JSX.Element => {
    const {
      docId,
      doc,
      steps,
      submitLabel = finishCreationLabel,
      preview,
      finishedSummary,
      onClose,
      onChange,
      onSubmit,
      onSubmitted,
    } = props;

    const summary = doc?.summary;

    const [step, setStep] = useState(0);
    const [configState, fetchConfigState] = useContext(ConfigContext);
    const [, toastDispatch] = useContext(ToastContext);
    const [userState, userDispatch] = useContext(UserContext);
    const { customizations, isSignedIn, userDoc } = userState;
    const username = userDoc?.username;
    const icon = userDoc?.icon?.fileUrl;
    const hex = userDoc?.hex;
    const phraseAdditions = customizations?.phrase_additions?.phraseTags;
    const phraseDeletions = customizations?.phrase_deletions?.phraseTags;
    const [summaryInputValue, setSummaryInputValue] = useState(summary);

    const recentlyRandomizedTags = useRef(new Set<string>());
    const recentlyRandomizedSummaryParts = useRef(new Set<string>());

    const [docIdState, setDocIdState] = useState(docId);
    const [tagCount, setTagCount] = useState(5);
    const [lockedTags, setLockedTags] = useState<string[]>([]);
    const [filteredTitleTags, setFilteredTitleTags] = useState<string[]>([]);
    const [filteredSummaryTags, setFilteredSummaryTags] = useState<string[]>(
      []
    );
    const [nameEdited, setNameEdited] = useState(false);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const originalDoc = useMemo(() => ({ ...(doc || {}) }), []);

    const [catalysts, setCatalysts] = useState<string[]>([]);
    const [personalities, setPersonalities] = useState<string[]>([]);
    const [archetypes, setArchetypes] = useState<string[]>([]);
    const [termTagsMap, setTermTagsMap] = useState<{
      [term: string]: string[];
    }>();
    const [phraseTagsMap, setPhraseTagsMap] = useState<{
      [phrase: string]: string[];
    }>();
    const [tagPhrasesMap, setTagPhrasesMap] = useState<{
      [tag: string]: string[];
    }>();
    const [tagCatalystsMap, setTagCatalystsMap] = useState<{
      [tag: string]: string[];
    }>();
    const [tagArchetypesMap, setTagArchetypesMap] = useState<{
      [tag: string]: string[];
    }>();
    const [filteredRelevantTitles, setFilteredRelevantTitles] = useState<
      [string, number][]
    >([]);
    const [filteredRelevantCatalysts, setFilteredRelevantCatalysts] = useState<
      string[]
    >([]);
    const [filteredRelevantArchetypes, setFilteredRelevantArchetypes] =
      useState<string[]>([]);

    useEffect(() => {
      setDocIdState(docId);
    }, [docId]);

    const [suggestedTitle] = filteredRelevantTitles?.[0] || [originalDoc?.name];

    const getFilteredRelevantStrings = useCallback(
      async (
        specificitySortedTags: string[],
        filteredTags: string[],
        tagPhrasesMap: {
          [tag: string]: string[];
        },
        limit?: number
      ): Promise<[string, number][]> => {
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
        const relevantTags = specificitySortedTags.filter(
          (tag) => !(filteredTags || []).includes(tag)
        );
        return getRelevantPhrases(
          relevantTags,
          tagPhrasesMap,
          termTagsMap,
          limit
        );
      },
      [termTagsMap]
    );

    useEffect(() => {
      const setup = async (): Promise<void> => {
        const latestConfigState = await fetchConfigState();
        const phrases = shuffle(latestConfigState?.phrases);
        const catalysts = shuffle(latestConfigState?.catalysts);
        const personalties = shuffle(
          latestConfigState?.moods?.personality?.flatMap((x) => x)
        );
        const archetypes = shuffle(latestConfigState?.archetypes);
        setCatalysts(catalysts);
        setPersonalities(personalties);
        setArchetypes(archetypes);
        const termTagsMap = latestConfigState?.terms;
        const getPhraseTagsMap = (
          await import("../../../impower-terms/utils/getPhraseTagsMap")
        ).default;
        setTermTagsMap(termTagsMap);
        const phraseTagsMap = getPhraseTagsMap(phrases, termTagsMap);
        setPhraseTagsMap(phraseTagsMap);
        setTagPhrasesMap(getReversedMap(phraseTagsMap));
        const catalystTagsMap = getPhraseTagsMap(catalysts, termTagsMap);
        setTagCatalystsMap(getReversedMap(catalystTagsMap));
        const archetypeTagsMap = getPhraseTagsMap(archetypes, termTagsMap);
        setTagArchetypesMap(getReversedMap(archetypeTagsMap));
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
      if (doc?.tags && filteredTitleTags && tagPhrasesMap) {
        getFilteredRelevantStrings(
          doc?.tags,
          filteredTitleTags,
          tagPhrasesMap,
          200
        ).then((result) => setFilteredRelevantTitles(result));
      }
    }, [
      tagPhrasesMap,
      filteredTitleTags,
      doc?.tags,
      getFilteredRelevantStrings,
    ]);

    useEffect(() => {
      if (doc?.tags && filteredSummaryTags && tagCatalystsMap) {
        getFilteredRelevantStrings(
          doc?.tags,
          filteredSummaryTags,
          tagCatalystsMap
        ).then((result) =>
          setFilteredRelevantCatalysts(result.map(([x]) => x))
        );
      }
    }, [
      tagCatalystsMap,
      filteredSummaryTags,
      doc?.tags,
      getFilteredRelevantStrings,
    ]);

    useEffect(() => {
      if (doc?.tags && filteredSummaryTags && tagArchetypesMap) {
        getFilteredRelevantStrings(
          doc?.tags,
          filteredSummaryTags,
          tagArchetypesMap
        ).then((result) =>
          setFilteredRelevantArchetypes(result.map(([x]) => x))
        );
      }
    }, [
      tagArchetypesMap,
      filteredSummaryTags,
      doc?.tags,
      getFilteredRelevantStrings,
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
      return ProjectDocumentInspector.instance;
    }, []);

    const tagLimit = handleGetInspector().getPropertyListCountLimit(
      "tags",
      doc
    );

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
            _createdBy: newDoc?._createdBy || Auth.instance.uid,
            name: newDoc.name.trim(),
            slug,
            hex: colors[tagColorName] || getRandomColor(),
            owners: [Auth.instance.uid],
          };
          if (claimedDoc._createdAt) {
            await new Promise<void>((resolve) =>
              userDispatch(
                userOnUpdateSubmission(
                  resolve,
                  claimedDoc,
                  "projects",
                  newDocId
                )
              )
            );
          } else {
            await new Promise<void>((resolve) =>
              userDispatch(
                userOnCreateSubmission(
                  resolve,
                  claimedDoc,
                  "projects",
                  newDocId
                )
              )
            );
          }
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
        Array.from(recentlyRandomizedTags.current),
        lockedTags,
        doc?.projectType
      );
      if (!newRandomizedTags) {
        recentlyRandomizedTags.current.clear();
        newRandomizedTags = await getRandomizedTags(
          validTagCount,
          Array.from(recentlyRandomizedTags.current),
          lockedTags,
          doc?.projectType
        );
      }
      const sortedRandomizedTags =
        getTagsSortedBySpecificity(newRandomizedTags);
      sortedRandomizedTags.forEach((tag) => {
        recentlyRandomizedTags.current.add(tag);
      });
      const tags = [...lockedTags, ...sortedRandomizedTags];
      if (onChange) {
        onChange({
          ...doc,
          tags,
        });
      }
    }, [lockedTags, tagCount, doc, onChange]);

    const handleRandomizeSummary = useCallback(
      async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const parts = summaryInputValue.split(" must ");
        const currentSuffix = parts[1] || "";
        const randomizableCatalysts =
          filteredRelevantCatalysts?.length > 0
            ? filteredRelevantCatalysts
            : catalysts;
        const randomizablePersonalities = personalities;
        const randomizableArchetypes =
          filteredRelevantArchetypes?.length > 0
            ? filteredRelevantArchetypes
            : archetypes;
        let newRandomizedTags = await getRandomizedStorySetup(
          randomizableCatalysts,
          randomizablePersonalities,
          randomizableArchetypes,
          Array.from(recentlyRandomizedSummaryParts.current)
        );
        if (!newRandomizedTags) {
          recentlyRandomizedSummaryParts.current.clear();
          newRandomizedTags = await getRandomizedStorySetup(
            randomizableCatalysts,
            randomizablePersonalities,
            randomizableArchetypes,
            Array.from(recentlyRandomizedSummaryParts.current)
          );
        }
        if (!newRandomizedTags) {
          return;
        }
        newRandomizedTags.forEach((tag) => {
          recentlyRandomizedSummaryParts.current.add(tag);
        });
        const tags = [...newRandomizedTags];
        const newPrefix = format(
          `After {catalyst}, {personality:regex:a} {personality} {archetype} must`,
          {
            catalyst: tags[0],
            personality: tags[1],
            archetype: tags[2],
          }
        );
        const newValue = `${newPrefix} ${currentSuffix}`;
        setSummaryInputValue(newValue);
        if (onChange) {
          onChange({
            ...doc,
            summary: newValue,
          });
        }
      },
      [
        summaryInputValue,
        filteredRelevantCatalysts,
        catalysts,
        personalities,
        filteredRelevantArchetypes,
        archetypes,
        onChange,
        doc,
      ]
    );

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

    const InspectorRenderPropertyProps: Partial<ProjectFieldProps> = {
      lockedTags,
      chosenTitle: doc?.name,
      sortedTags: doc?.tags,
      relevancyFilteredTags: filteredTitleTags,
      relevantTitles: filteredRelevantTitles,
      terms: termTagsMap,
      tags: doc?.tags,
      onLockTag: handleLockTag,
      onRelevancyFilter: setFilteredTitleTags,
      onChooseTitle: handleChosenTitle,
      onAddPhrase: handleAddPhrase,
      onDeletePhrase: handleDeletePhrase,
      onEditPhrase: handleEditPhrase,
      onChangeTags: handleChangeTags,
    };

    const handleStep = useCallback(
      async (e: React.MouseEvent, newStep: number): Promise<boolean> => {
        setStep(newStep);
        return true;
      },
      []
    );

    const stepsWithChildren = useMemo(() => {
      const newSteps = [...steps];
      const tagStepIndex = steps.findIndex((step) =>
        step.propertyPaths.includes("tags")
      );
      newSteps[tagStepIndex].footerChildren = (
        <>
          <ProjectTagsInspiration
            min={lockedTags.length + 1}
            max={tagLimit}
            amount={tagCount}
            disabled={lockedTags.length >= tagLimit}
            onChangeAmount={setTagCount}
            onClick={handleRandomizeTags}
          />
          <StyledSeparator />
        </>
      );
      const summaryStepIndex = steps.findIndex((step) =>
        step.propertyPaths.includes("summary")
      );
      newSteps[summaryStepIndex].headerChildren =
        doc?.projectType === "story" ? (
          <StyledGeneratorArea>
            <ProjectGeneratorTagsSelector
              tags={doc?.tags}
              filteredTags={filteredSummaryTags}
              onFilterTags={setFilteredSummaryTags}
            />
          </StyledGeneratorArea>
        ) : undefined;
      newSteps[summaryStepIndex].footerChildren =
        doc?.projectType === "story" ? (
          <ProjectSummaryInspiration onClick={handleRandomizeSummary} />
        ) : undefined;
      return newSteps;
    }, [
      doc?.projectType,
      doc?.tags,
      filteredSummaryTags,
      handleRandomizeSummary,
      handleRandomizeTags,
      lockedTags.length,
      steps,
      tagCount,
      tagLimit,
    ]);

    return (
      <CreatePageForm
        step={step}
        steps={stepsWithChildren}
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
        renderProperty={ProjectField}
        renderPropertyProps={InspectorRenderPropertyProps}
        onStep={handleStep}
      />
    );
  }
);

export default CreateProjectForm;
