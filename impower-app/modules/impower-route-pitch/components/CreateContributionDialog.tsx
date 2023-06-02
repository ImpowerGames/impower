import styled from "@emotion/styled";
import { DialogProps } from "@mui/material/Dialog";
import React from "react";
import {
  ContributionDocument,
  ProjectDocument,
} from "../../impower-data-store";
import CreateContributionForm from "./CreateContributionForm";
import PitchDialog from "./PitchDialog";

const StyledMonospaceFontLoader = styled.p`
  font-family: ${(props): string => props.theme.fontFamily.monospace};
  top: -1000vh;
  left: -1000vw;
  position: absolute;
  pointer-events: none;
`;

interface CreateContributionDialogProps
  extends Omit<DialogProps, "maxWidth" | "onSubmit"> {
  pitchId: string;
  pitchDoc: ProjectDocument;
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

const CreateContributionDialog = React.memo(
  (props: CreateContributionDialogProps) => {
    const {
      open,
      pitchId,
      pitchDoc,
      doc,
      editing,
      file,
      onClose,
      onSubmit,
      onUnsavedChange,
      ...dialogProps
    } = props;

    return (
      <>
        {/* Load fonts so they don't flash later */}
        <StyledMonospaceFontLoader>.</StyledMonospaceFontLoader>
        <PitchDialog open={open} onClose={onClose} {...dialogProps}>
          <CreateContributionForm
            pitchId={pitchId}
            pitchDoc={pitchDoc}
            doc={doc}
            editing={editing}
            file={file}
            onClose={onClose}
            onSubmit={onSubmit}
            onUnsavedChange={onUnsavedChange}
          />
        </PitchDialog>
      </>
    );
  }
);

export default CreateContributionDialog;
