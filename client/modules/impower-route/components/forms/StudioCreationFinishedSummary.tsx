import React from "react";
import CircleInfoRegularIcon from "../../../../resources/icons/regular/circle-info.svg";
import GamepadRegularIcon from "../../../../resources/icons/regular/gamepad.svg";
import { StorageFile } from "../../../impower-core";
import { StudioDocument } from "../../../impower-data-store";
import CreationFinishedSummary from "./CreationFinishedSummary";

const successfulTitle = "All right! Your studio is ready to go!";
const successfulDescription = "What would you like to do next?";

const actionButtons: {
  [type: string]: {
    label: string;
    icon: string;
    link: string;
    variant?: "text" | "outlined" | "contained";
  };
} = {
  CreateGame: {
    label: "Create A Game",
    icon: GamepadRegularIcon,
    link: "/e/s/{id}?t=games&mode=create",
    variant: "contained",
  },
  CustomizePage: {
    label: "Customize Studio Page",
    icon: CircleInfoRegularIcon,
    link: "/e/s/{id}?t=settings",
    variant: "outlined",
  },
};

interface StudioCreationFinishedSummaryProps {
  docId: string;
  doc: StudioDocument;
  onUploadIcon: (file: StorageFile) => void;
}

const StudioCreationFinishedSummary = React.memo(
  (props: StudioCreationFinishedSummaryProps): JSX.Element | null => {
    const { docId, doc, onUploadIcon } = props;
    return (
      <CreationFinishedSummary
        collection="studios"
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

export default StudioCreationFinishedSummary;
