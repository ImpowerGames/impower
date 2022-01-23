import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import OutlinedInput from "@material-ui/core/OutlinedInput";
import Paper from "@material-ui/core/Paper";
import React, { useCallback, useContext, useMemo, useState } from "react";
import format from "../../../impower-config/utils/format";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../../impower-confirm-dialog";
import { Timestamp } from "../../../impower-core";
import {
  StudioDocument,
  StudioDocumentInspector,
  useDocument,
} from "../../../impower-data-store";
import InspectorForm from "../../../impower-route/components/forms/InspectorForm";
import AutocompleteInput from "../../../impower-route/components/inputs/AutocompleteInput";
import BooleanInput from "../../../impower-route/components/inputs/BooleanInput";
import ColorInput from "../../../impower-route/components/inputs/ColorInput";
import FileInput from "../../../impower-route/components/inputs/FileInput";
import NumberInput from "../../../impower-route/components/inputs/NumberInput";
import ObjectFieldArea from "../../../impower-route/components/inputs/ObjectFieldArea";
import StringInput from "../../../impower-route/components/inputs/StringInput";
import {
  UserContext,
  userOnDeleteSubmission,
  userOnUpdateSubmission,
} from "../../../impower-user";

const advancedLabel = "Advanced Settings";
const deleteLabel = "Permanently Delete Studio";

const deleteConfirmationInfo = {
  title: "Are you sure you want to delete this studio?",
  content:
    "Deleting {name} will delete the studio, and **delete ALL games, resources, and assets owned by the studio.**\n\n**This action cannot be undone.**",
  agreeLabel: "Yes, Delete My Studio",
  disagreeLabel: "Cancel",
};

const propertyPaths = [
  "About/name",
  "About/tags",
  "About/neededRoles",
  "About/summary",
  "Branding/hex",
  "Branding/icon",
  "Branding/cover",
  "Branding/logo",
  "Page/slug",
  "Page/status",
  "Page/published",
];

const StyledPaddingArea = styled.div`
  flex: 1;
  position: relative;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  padding: ${(props): string => props.theme.spacing(8, 2)};

  ${(props): string => props.theme.breakpoints.down("md")} {
    padding: ${(props): string => props.theme.spacing(2, 2)};
  }

  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(0, 0)};
  }
`;

const StyledPaper = styled(Paper)`
  flex: 1;
  margin: auto;
  position: relative;
  width: 100%;
  overflow: hidden;

  padding: ${(props): string => props.theme.spacing(4, 4)};

  ${(props): string => props.theme.breakpoints.down("md")} {
    padding: ${(props): string => props.theme.spacing(3, 3)};
  }

  ${(props): string => props.theme.breakpoints.down("sm")} {
    padding: ${(props): string => props.theme.spacing(3, 2)};
  }
`;

const StyledDeleteButtonArea = styled.div`
  color: ${(props): string => props.theme.palette.error.light};
`;

const StyledDeleteButton = styled(Button)``;

interface SettingsConsoleProps {
  studioId: string;
  maxWidth?: number;
  onDeleting?: () => void;
  onDeleted?: () => void;
  onDeletionFailed?: () => void;
}

const SettingsConsole = (props: SettingsConsoleProps): JSX.Element => {
  const {
    studioId,
    maxWidth = 960,
    onDeleting,
    onDeleted,
    onDeletionFailed,
  } = props;

  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [, userDispatch] = useContext(UserContext);

  const studioDoc = useDocument<StudioDocument>("studios", studioId);
  const studioName = studioDoc?.name;

  const [expandedProperties, setExpandedProperties] = useState<string[]>([]);

  const data = useMemo(() => [studioDoc], [studioDoc]);
  const handleGetPropertyDocIds = useCallback(() => [studioId], [studioId]);

  const handleExpandProperty = useCallback(
    (propertyPath, expanded): void => {
      if (expanded && !expandedProperties.includes(propertyPath)) {
        setExpandedProperties([...expandedProperties, propertyPath]);
      } else if (!expanded && expandedProperties.includes(propertyPath)) {
        setExpandedProperties(
          expandedProperties.filter((p): boolean => p !== propertyPath)
        );
      }
    },
    [expandedProperties]
  );

  const handleGetInspector = useCallback(() => {
    return StudioDocumentInspector.instance;
  }, []);

  const handleDebouncedChange = useCallback(
    async (data: StudioDocument[]) => {
      const doc = data?.[0];
      const newDoc = doc.published
        ? { ...doc, republishedAt: new Timestamp() }
        : doc;
      if (doc) {
        await new Promise<void>((resolve) =>
          userDispatch(
            userOnUpdateSubmission(resolve, newDoc, "studios", studioId)
          )
        );
      }
    },
    [studioId, userDispatch]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const onAgree = async (): Promise<void> => {
        try {
          if (onDeleting) {
            onDeleting();
          }
          await new Promise<void>((resolve) =>
            userDispatch(userOnDeleteSubmission(resolve, "studios", studioId))
          );
          if (onDeleted) {
            onDeleted();
          }
        } catch {
          if (onDeletionFailed) {
            onDeletionFailed();
          }
        }
      };
      confirmDialogDispatch(
        confirmDialogNavOpen(
          deleteConfirmationInfo.title,
          format(deleteConfirmationInfo.content, {
            name: studioName ? `"${studioName}"` : "this studio",
          }),
          deleteConfirmationInfo.agreeLabel,
          onAgree,
          deleteConfirmationInfo.disagreeLabel
        )
      );
    },
    [
      confirmDialogDispatch,
      studioName,
      onDeleting,
      studioId,
      onDeleted,
      userDispatch,
      onDeletionFailed,
    ]
  );

  if (!studioDoc) {
    return null;
  }

  return (
    <StyledPaddingArea>
      <StyledPaper
        style={{
          maxWidth,
        }}
      >
        <InspectorForm
          variant="outlined"
          InputComponent={OutlinedInput}
          ColorInputComponent={ColorInput}
          StringInputComponent={StringInput}
          FileInputComponent={FileInput}
          NumberInputComponent={NumberInput}
          BooleanInputComponent={BooleanInput}
          AutocompleteInputComponent={AutocompleteInput}
          size="medium"
          propertyPaths={propertyPaths}
          spacing={16}
          data={data}
          expandedProperties={expandedProperties}
          getPropertyDocPaths={handleGetPropertyDocIds}
          onExpandProperty={handleExpandProperty}
          getInspector={handleGetInspector}
          onDebouncedChange={handleDebouncedChange}
        />
        <ObjectFieldArea
          label={advancedLabel}
          propertyPath={advancedLabel}
          expanded={expandedProperties.includes(advancedLabel)}
          onExpanded={(e): void => handleExpandProperty(advancedLabel, e)}
          spacing={8}
        >
          <StyledDeleteButtonArea>
            <StyledDeleteButton
              variant="outlined"
              color="inherit"
              onClick={handleDelete}
            >
              {deleteLabel}
            </StyledDeleteButton>
          </StyledDeleteButtonArea>
        </ObjectFieldArea>
      </StyledPaper>
    </StyledPaddingArea>
  );
};

export default SettingsConsole;
