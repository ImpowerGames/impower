import React from "react";
import BullhornRegularIcon from "../../../../resources/icons/regular/bullhorn.svg";
import ScrewdriverWrenchRegularIcon from "../../../../resources/icons/regular/screwdriver-wrench.svg";
import { StorageFile } from "../../../impower-core";
import { ResourceDocument } from "../../../impower-data-store";
import CreationFinishedSummary from "./CreationFinishedSummary";

const successfulTitle = "All right! Your resource is ready to go!";
const successfulDescription = "What would you like to do next?";

const actionButtons: {
  [type: string]: {
    label: string;
    icon: string;
    link: string;
    variant?: "text" | "outlined" | "contained";
  };
} = {
  BuildResource: {
    label: "Build It!",
    icon: ScrewdriverWrenchRegularIcon,
    link: "/e/r/{id}",
    variant: "contained",
  },
  PitchResource: {
    label: "Pitch It!",
    icon: BullhornRegularIcon,
    link: "/r/p?resource={id}",
    variant: "outlined",
  },
};

interface ResourceCreationFinishedSummaryProps {
  docId: string;
  doc: ResourceDocument;
  onUploadIcon: (file: StorageFile) => void;
}

const ResourceCreationFinishedSummary = React.memo(
  (props: ResourceCreationFinishedSummaryProps): JSX.Element | null => {
    const { docId, doc, onUploadIcon } = props;
    return (
      <CreationFinishedSummary
        collection="resources"
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

export default ResourceCreationFinishedSummary;
