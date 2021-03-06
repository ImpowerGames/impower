import React from "react";
import BullhornRegularIcon from "../../../../resources/icons/regular/bullhorn.svg";
import ScrewdriverWrenchRegularIcon from "../../../../resources/icons/regular/screwdriver-wrench.svg";
import { StorageFile } from "../../../impower-core";
import { ProjectDocument } from "../../../impower-data-store";
import CreationFinishedSummary from "./CreationFinishedSummary";

const successfulTitle = "All right! Your game is ready to go!";
const successfulDescription = "What would you like to do next?";

const actionButtons: {
  [type: string]: {
    label: string;
    icon: string;
    link: string;
    variant?: "text" | "outlined" | "contained";
  };
} = {
  PitchGame: {
    label: "Build It!",
    icon: ScrewdriverWrenchRegularIcon,
    link: "/e/g/{id}",
    variant: "contained",
  },
  BuildGame: {
    label: "Pitch It!",
    icon: BullhornRegularIcon,
    link: "/g/p?game={id}",
    variant: "outlined",
  },
};

interface GameCreationFinishedSummaryProps {
  docId: string;
  doc: ProjectDocument;
  onUploadIcon: (file: StorageFile) => void;
}

const GameCreationFinishedSummary = React.memo(
  (props: GameCreationFinishedSummaryProps): JSX.Element | null => {
    const { docId, doc, onUploadIcon } = props;
    return (
      <CreationFinishedSummary
        collection="projects"
        docId={docId}
        doc={doc}
        onUploadIcon={onUploadIcon}
        successfulTitle={successfulTitle}
        successfulDescription={successfulDescription}
        finishedButtons={actionButtons}
      />
    );
  }
);

export default GameCreationFinishedSummary;
