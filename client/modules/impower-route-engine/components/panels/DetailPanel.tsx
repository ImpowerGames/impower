import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import FilledInput from "@material-ui/core/FilledInput";
import React, { useCallback, useContext, useMemo, useRef } from "react";
import {
  ConfigTypeId,
  InstanceData,
  Reference,
} from "../../../../../spark-engine";
import ArrowLeftRegularIcon from "../../../../resources/icons/regular/arrow-left.svg";
import { getLabel } from "../../../impower-config";
import format from "../../../impower-config/utils/format";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../../impower-confirm-dialog";
import {
  isGameDocument,
  PageDocumentInspector,
  ProjectDocument,
  ProjectDocumentInspector,
} from "../../../impower-data-store";
import InspectorForm from "../../../impower-route/components/forms/InspectorForm";
import AutocompleteInput from "../../../impower-route/components/inputs/AutocompleteInput";
import BooleanInput from "../../../impower-route/components/inputs/BooleanInput";
import ColorInput from "../../../impower-route/components/inputs/ColorInput";
import FileInput from "../../../impower-route/components/inputs/FileInput";
import NumberInput from "../../../impower-route/components/inputs/NumberInput";
import ObjectField from "../../../impower-route/components/inputs/ObjectField";
import StringInput from "../../../impower-route/components/inputs/StringInput";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../../../impower-route/hooks/useHTMLOverscrollBehavior";
import { useRouter } from "../../../impower-router";
import { UserContext, userOnDeleteSubmission } from "../../../impower-user";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import {
  panelAddInteraction,
  panelOpen,
  panelRemoveInteraction,
  panelSetErrors,
} from "../../types/actions/panelActions";
import {
  projectChangeDocument,
  projectUpdateData,
} from "../../types/actions/projectActions";
import { WindowType } from "../../types/state/windowState";
import InstanceInspectorForm from "../forms/InstanceInspectorForm";
import PanelHeader from "../headers/PanelHeader";
import Panel from "../layouts/Panel";

const deleteGameLabel = "Permanently Delete Game";

const deleteGameConfirmationInfo = {
  title: "Are you sure you want to delete this game?",
  content:
    "Deleting {name} will delete the game project, all assets uploaded to the project, and the game's public page.\n\n*No one will be able to edit or play this game again.*\n\n**This action cannot be undone.**",
  agreeLabel: "Yes, Delete My Game",
  disagreeLabel: "Cancel",
};

export const detailsSetupHeader = {
  type: "Details",
  name: "Details",
  pluralName: "Details",
};

export const configurationSetupHeader = {
  type: "Configuration",
  name: "Configuration",
  pluralName: "Configuration",
};

export const accessSetupHeader = {
  type: "Access",
  name: "Access",
  pluralName: "Access",
};

const StyledDeleteButtonArea = styled.div`
  color: ${(props): string => props.theme.palette.error.light};
`;

const StyledDeleteButton = styled(Button)``;

const StyledList = styled.div`
  padding-top: ${(props): string => props.theme.spacing(2)};
  padding-bottom: ${(props): string => props.theme.spacing(2)};
  padding-left: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
  flex: 1;
  display: flex;
  position: relative;
  flex-direction: column;
  color: ${(props): string => props.theme.colors.white80};
`;

const StyledRightPaddingArea = styled.div`
  padding-right: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
`;

const StyledFilledInput = styled(FilledInput)`
  border-radius: ${(props): string => props.theme.spacing(1)};
`;

interface SetupDetailsProps {
  disabled?: boolean;
  id: string;
  doc: ProjectDocument;
  submitting: boolean;
  errors: { [propertyPath: string]: string };
  propertyPaths?: string[];
  expandedProperties: string[];
  onExpandProperty?: (propertyPath: string, expanded: boolean) => void;
  onChange?: (doc: ProjectDocument[]) => void;
  onDebouncedChange?: (doc: ProjectDocument[]) => void;
  onPropertyErrorFound?: (propertyPath: string, error: string) => void;
  onPropertyErrorFixed?: (propertyPath: string) => void;
}

const SetupDetails = React.memo((props: SetupDetailsProps) => {
  const {
    id,
    doc,
    submitting,
    errors,
    disabled,
    propertyPaths,
    expandedProperties,
    onExpandProperty,
    onChange,
    onDebouncedChange,
    onPropertyErrorFound,
    onPropertyErrorFixed,
  } = props;

  const handleGetInspector = useCallback(() => {
    return isGameDocument(doc)
      ? ProjectDocumentInspector.instance
      : new PageDocumentInspector<ProjectDocument>();
  }, [doc]);

  const handleGetPropertyDocIds = useCallback(() => [id], [id]);

  const data = useMemo(() => [doc], [doc]);

  return (
    <StyledRightPaddingArea>
      <InspectorForm
        variant="filled"
        inset
        size="small"
        backgroundColor="white"
        propertyPaths={propertyPaths}
        spacing={8}
        disabled={disabled}
        submitting={submitting}
        showErrors={Boolean(errors)}
        errors={errors}
        data={data}
        expandedProperties={expandedProperties}
        InputComponent={StyledFilledInput}
        ColorInputComponent={ColorInput}
        AutocompleteInputComponent={AutocompleteInput}
        StringInputComponent={StringInput}
        FileInputComponent={FileInput}
        NumberInputComponent={NumberInput}
        BooleanInputComponent={BooleanInput}
        ObjectFieldComponent={ObjectField}
        getPropertyDocPaths={handleGetPropertyDocIds}
        onExpandProperty={onExpandProperty}
        onChange={onChange}
        onDebouncedChange={onDebouncedChange}
        getInspector={handleGetInspector}
        onPropertyErrorFound={onPropertyErrorFound}
        onPropertyErrorFixed={onPropertyErrorFixed}
      />
    </StyledRightPaddingArea>
  );
});

interface SetupAdvancedProps {
  id: string;
  doc: ProjectDocument;
}

const SetupAdvanced = React.memo((props: SetupAdvancedProps) => {
  const { id, doc } = props;

  const router = useRouter();
  const [, userDispatch] = useContext(UserContext);
  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const onAgree = async (): Promise<void> => {
        const studioId = doc?.studio;
        if (isGameDocument(doc)) {
          await new Promise<void>((resolve) => {
            userDispatch(userOnDeleteSubmission(resolve, "projects", id));
          });
          if (studioId) {
            router.push(`/e/s/${studioId}?t=games`);
          } else {
            router.push(`/e`);
          }
        }
      };
      if (isGameDocument(doc)) {
        confirmDialogDispatch(
          confirmDialogNavOpen(
            deleteGameConfirmationInfo.title,
            format(deleteGameConfirmationInfo.content, {
              name: doc?.name ? `"${doc?.name}"` : "this game",
            }),
            deleteGameConfirmationInfo.agreeLabel,
            onAgree,
            deleteGameConfirmationInfo.disagreeLabel
          )
        );
      }
    },
    [confirmDialogDispatch, doc, id, router, userDispatch]
  );

  const deleteLabel = isGameDocument(doc) ? deleteGameLabel : undefined;

  return (
    <StyledRightPaddingArea>
      {deleteLabel && (
        <StyledDeleteButtonArea>
          <StyledDeleteButton
            variant="outlined"
            color="inherit"
            onClick={handleDelete}
          >
            {deleteLabel}
          </StyledDeleteButton>
        </StyledDeleteButtonArea>
      )}
    </StyledRightPaddingArea>
  );
});

interface DetailPanelProps {
  windowType: WindowType;
  open?: boolean;
}

const DetailPanel = React.memo((props: DetailPanelProps): JSX.Element => {
  const { windowType } = props;

  const { portrait } = useContext(WindowTransitionContext);
  const [state, dispatch] = useContext(ProjectEngineContext);

  const theme = useTheme();

  const id = state?.project?.id;
  const data = state?.project?.data;
  const doc = state?.project?.data?.doc;
  const mode = state?.test?.mode;
  const panelState = state?.panel?.panels?.[windowType];
  const inspectedTargetId = panelState?.inspectedTargetId;
  const inspectedProperties = panelState?.inspectedProperties;
  const submitting = panelState?.submitting;
  const errors = panelState?.errors;
  const section = panelState?.section;
  const expandedProperties = panelState?.interactions?.Expanded;

  const stateRef = useRef<ProjectDocument>(doc);

  const inspectedInstanceData: InstanceData[] = useMemo(() => {
    if (section === "configuration") {
      const config =
        data?.instances?.configs?.data?.[inspectedTargetId as ConfigTypeId];
      if (config) {
        return [config];
      }
    }
    return [];
  }, [data, inspectedTargetId, section]);

  const handleClickHeaderBreadcrumb = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch(panelOpen(windowType, "setup"));
    },
    [dispatch, windowType]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch(panelOpen(windowType, "setup"));
    },
    [dispatch, windowType]
  );

  const handleDebouncedInstancePropertyChange = useCallback(
    (references: Reference[], propertyPath: string, value: unknown) => {
      // Items are selected, so assume the user is editing the selected items
      dispatch(projectUpdateData(references, propertyPath, value));
    },
    [dispatch]
  );

  const handleExpandProperty = useCallback(
    (propertyPath: string, expanded: boolean) => {
      if (expanded) {
        dispatch(panelAddInteraction(windowType, "Expanded", [propertyPath]));
      } else {
        dispatch(
          panelRemoveInteraction(windowType, "Expanded", [propertyPath])
        );
      }
    },
    [windowType, dispatch]
  );

  const handleChange = useCallback((docs: ProjectDocument[]) => {
    const newDoc = docs[0];
    stateRef.current = newDoc;
  }, []);

  const handleDebouncedChange = useCallback(
    (docs: ProjectDocument[]) => {
      const newDoc = docs[0];
      dispatch(
        projectChangeDocument(id, {
          ...stateRef.current,
          ...newDoc,
        })
      );
    },
    [dispatch, id]
  );

  const handlePropertyErrorFound = useCallback(
    (propertyPath: string, error: string) => {
      if (!errors[propertyPath]) {
        const newErrors = { ...errors, [propertyPath]: error };
        dispatch(panelSetErrors("setup", newErrors));
      }
    },
    [dispatch, errors]
  );

  const handlePropertyErrorFixed = useCallback(
    (propertyPath: string) => {
      if (errors[propertyPath]) {
        const newErrors = { ...errors };
        delete newErrors[propertyPath];
        dispatch(panelSetErrors("setup", newErrors));
      }
    },
    [dispatch, errors]
  );

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);
  useHTMLOverscrollBehavior("contain");

  const inspectedDataName = useMemo(() => {
    if (section === "configuration") {
      const config =
        data?.instances?.configs?.data[inspectedTargetId as ConfigTypeId];
      if (config) {
        return getLabel(inspectedTargetId);
      }
    }
    return getLabel(inspectedTargetId);
  }, [data, inspectedTargetId, section]);

  return (
    <>
      <Panel
        key={inspectedTargetId}
        useWindowAsScrollContainer={portrait}
        topChildren={
          <PanelHeader
            type="default"
            title={inspectedDataName}
            backIcon={<ArrowLeftRegularIcon />}
            backLabel={`Close`}
            onBack={handleClose}
            onBreadcrumb={handleClickHeaderBreadcrumb}
            nameStyle={{ opacity: mode === "Test" ? 0.5 : undefined }}
          />
        }
      >
        <StyledList style={{ opacity: mode === "Test" ? 0.5 : undefined }}>
          {section === "details" ? (
            inspectedTargetId === "AdvancedSettings" ? (
              <SetupAdvanced id={id} doc={doc} />
            ) : (
              <SetupDetails
                disabled={mode === "Test"}
                id={id}
                doc={doc}
                submitting={submitting}
                errors={errors}
                propertyPaths={inspectedProperties}
                expandedProperties={expandedProperties}
                onExpandProperty={handleExpandProperty}
                onChange={handleChange}
                onDebouncedChange={handleDebouncedChange}
                onPropertyErrorFound={handlePropertyErrorFound}
                onPropertyErrorFixed={handlePropertyErrorFixed}
              />
            )
          ) : (
            <InstanceInspectorForm
              variant="filled"
              inset
              InputComponent={StyledFilledInput}
              size="small"
              backgroundColor="white"
              data={inspectedInstanceData}
              disabled={mode === "Test"}
              expandedProperties={expandedProperties}
              onExpandProperty={handleExpandProperty}
              onDebouncedPropertyChange={handleDebouncedInstancePropertyChange}
            />
          )}
        </StyledList>
      </Panel>
    </>
  );
});

export default DetailPanel;
