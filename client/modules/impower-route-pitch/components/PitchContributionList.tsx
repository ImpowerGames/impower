import styled from "@emotion/styled";
import CircularProgress from "@material-ui/core/CircularProgress";
import dynamic from "next/dynamic";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ContributionDocument,
  ContributionType,
  ProjectDocument,
} from "../../impower-data-store";
import { useDialogNavigation } from "../../impower-dialog";
import AddContributionToolbar from "./AddContributionToolbar";
import ContributionList from "./ContributionList";

const SORT_OPTIONS: ["rating", "rank", "new"] = ["rating", "rank", "new"];

const CreateContributionDialog = dynamic(
  () => import("./CreateContributionDialog"),
  { ssr: false }
);

const StyledLoadingArea = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledCircularProgress = styled(CircularProgress)`
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

interface PitchContributionListProps {
  scrollParent?: HTMLElement;
  pitchId?: string;
  pitchDoc?: ProjectDocument;
  contributionDocs?: { [id: string]: ContributionDocument };
  toolbarRef?: React.Ref<HTMLDivElement>;
  toolbarAreaStyle?: React.CSSProperties;
  toolbarStyle?: React.CSSProperties;
  onCreateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onUpdateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onDeleteContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
}

const PitchContributionList = React.memo(
  (props: PitchContributionListProps): JSX.Element => {
    const {
      scrollParent,
      pitchId,
      pitchDoc,
      contributionDocs,
      toolbarRef,
      toolbarAreaStyle,
      toolbarStyle,
      onCreateContribution,
      onUpdateContribution,
      onDeleteContribution,
    } = props;

    const [createContributionDialogOpen, setCreateContributionDialogOpen] =
      useState<boolean>();
    const [editing, setEditing] = useState(false);
    const [createDoc, setCreateDoc] = useState<ContributionDocument>();
    const [createFile, setCreateFile] = useState<globalThis.File>();

    const hasUnsavedChangesRef = useRef(false);

    const handleBrowserNavigation = useCallback(
      (
        currState: Record<string, string>,
        prevState?: Record<string, string>
      ) => {
        if (currState?.e !== prevState?.e) {
          setCreateContributionDialogOpen(currState?.e === "contribution");
        }
      },
      []
    );
    const [openEditDialog, closeEditDialog] = useDialogNavigation(
      "e",
      handleBrowserNavigation
    );

    const handleEditContribution = useCallback(
      async (
        e: React.MouseEvent,
        pitchId: string,
        contributionId: string,
        doc: ContributionDocument
      ): Promise<void> => {
        setCreateDoc(doc);
        setEditing(true);
        setCreateContributionDialogOpen(true);
        openEditDialog("contribution", "Edit Contribution");
      },
      [openEditDialog]
    );

    const handleOpenCreateDialogForm = useCallback(
      async (
        e: React.MouseEvent<Element, MouseEvent>,
        newDoc: ContributionDocument,
        file: globalThis.File
      ): Promise<void> => {
        setCreateDoc(newDoc);
        setCreateFile(file);
        setEditing(false);
        setCreateContributionDialogOpen(true);
        openEditDialog("contribution", "Create Contribution");
      },
      [openEditDialog]
    );

    const handleCloseCreateDialog = useCallback(async () => {
      if (hasUnsavedChangesRef.current) {
        return;
      }
      setCreateContributionDialogOpen(false);
      closeEditDialog();
    }, [closeEditDialog]);

    const handleContribute = useCallback(
      (
        e: React.MouseEvent<Element, MouseEvent>,
        contributionId: string,
        doc: ContributionDocument
      ): void => {
        if (editing) {
          if (onUpdateContribution) {
            onUpdateContribution(e, pitchId, contributionId, doc);
          }
        } else if (onCreateContribution) {
          onCreateContribution(e, pitchId, contributionId, doc);
        }
      },
      [editing, onCreateContribution, onUpdateContribution, pitchId]
    );

    const handleUnsavedChange = useCallback(
      (hasUnsavedChanges: boolean): void => {
        hasUnsavedChangesRef.current = hasUnsavedChanges;
      },
      []
    );

    const contributionTypes: ContributionType[] = useMemo(
      () =>
        pitchDoc?.summary === ""
          ? ["pitch", "story", "image", "audio"]
          : ["story", "image", "audio"],
      [pitchDoc?.summary]
    );

    const loadingPlaceholder = useMemo(
      () => (
        <StyledLoadingArea>
          <StyledCircularProgress color="secondary" />
        </StyledLoadingArea>
      ),
      []
    );

    const listStyle = useMemo(() => ({ backgroundColor: "white" }), []);
    const queryHeaderStyle = useMemo(() => ({ backgroundColor: "white" }), []);

    return (
      <>
        <ContributionList
          scrollParent={scrollParent}
          pitchId={pitchId}
          pitchDoc={pitchDoc}
          contributionDocs={contributionDocs}
          sortOptions={SORT_OPTIONS}
          emptyLabel={`Feeling Inspired?`}
          emptySubtitle={`Contribute Something!`}
          noMoreLabel={`That's all for now!`}
          loadingPlaceholder={loadingPlaceholder}
          style={listStyle}
          queryHeaderStyle={queryHeaderStyle}
          onEditContribution={handleEditContribution}
          onDeleteContribution={onDeleteContribution}
        >
          <AddContributionToolbar
            types={contributionTypes}
            toolbarRef={toolbarRef}
            pitchId={pitchId}
            hidden={createContributionDialogOpen}
            onAdd={handleOpenCreateDialogForm}
            style={toolbarStyle}
            toolbarAreaStyle={toolbarAreaStyle}
          />
        </ContributionList>
        {createContributionDialogOpen !== undefined && (
          <CreateContributionDialog
            open={createContributionDialogOpen}
            pitchId={pitchId}
            pitchDoc={pitchDoc}
            doc={createDoc}
            file={createFile}
            editing={editing}
            onClose={handleCloseCreateDialog}
            onSubmit={handleContribute}
            onUnsavedChange={handleUnsavedChange}
          />
        )}
      </>
    );
  }
);

export default PitchContributionList;
