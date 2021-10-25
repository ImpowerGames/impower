import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import FilledInput from "@material-ui/core/FilledInput";
import Typography from "@material-ui/core/Typography";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AngleLeftRegularIcon from "../../../../resources/icons/regular/angle-left.svg";
import AngleRightRegularIcon from "../../../../resources/icons/regular/angle-right.svg";
import ArrowLeftRegularIcon from "../../../../resources/icons/regular/arrow-left.svg";
import { getLabel } from "../../../impower-config";
import format from "../../../impower-config/utils/format";
import {
  ConfirmDialogContext,
  confirmDialogNavOpen,
} from "../../../impower-confirm-dialog";
import {
  GameDocument,
  GameDocumentInspector,
  isGameDocument,
  isResourceDocument,
  PageDocumentInspector,
  ResourceDocument,
  ResourceDocumentInspector,
} from "../../../impower-data-store";
import {
  ConfigTypeId,
  GameProjectData,
  InstanceData,
  isGameProjectData,
  ItemData,
  ItemReference,
  ItemSectionType,
  ItemType,
  Reference,
  SetupSectionType,
  SetupSettingsType,
} from "../../../impower-game/data";
import { getData } from "../../../impower-game/inspector";
import { InputBlocker } from "../../../impower-route";
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
import { useRouter } from "../../../impower-router";
import { UserContext, userOnDeleteSubmission } from "../../../impower-user";
import { GameInspectorContext } from "../../contexts/gameInspectorContext";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import {
  useInspectedContainers,
  useItemNavigation,
} from "../../hooks/dataHooks";
import {
  dataPanelAddInteraction,
  dataPanelInspect,
  dataPanelOpen,
  dataPanelRemoveInteraction,
  dataPanelSetErrors,
} from "../../types/actions/dataPanelActions";
import {
  projectChangeDocument,
  projectUpdateData,
  projectValidateData,
} from "../../types/actions/projectActions";
import { getHeader } from "../../types/info/headers";
import { getItems } from "../../types/selectors/dataPanelSelectors";
import {
  DataInteractionType,
  DataPanelType,
  DataWindowType,
} from "../../types/state/dataPanelState";
import { Mode } from "../../types/state/testState";
import { PanelType } from "../../types/state/windowState";
import InstanceInspectorForm from "../forms/InstanceInspectorForm";
import PanelHeader from "../headers/PanelHeader";
import PanelHeaderIconButton from "../iconButtons/PanelHeaderIconButton";
import EditGameTooltipContent from "../instructions/EditGameTooltipContent";
import Panel from "../layouts/Panel";

const deleteGameLabel = "Permanently Delete Game";
const deleteResourceLabel = "Permanently Delete Resource";

const deleteGameConfirmationInfo = {
  title: "Are you sure you want to delete this game?",
  content:
    "Deleting {name} will delete the game project, all assets uploaded to the project, and the game's public page.\n\n*No one will be able to edit or play this game again.*\n\n**This action cannot be undone.**",
  agreeLabel: "Yes, Delete My Game",
  disagreeLabel: "Cancel",
};
const deleteResourceConfirmationInfo = {
  title: "Are you sure you want to delete this resource?",
  content:
    "Deleting {name} will delete the resource project, all assets uploaded to the project, and the resource's public page.\n\n*No one will be able to edit or play this resource again.*\n\n**This action cannot be undone.**",
  agreeLabel: "Yes, Delete My Resource",
  disagreeLabel: "Cancel",
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

const StyledPaginationArea = styled.div`
  position: relative;
  display: flex;
  background-color: ${(props): string => props.theme.colors.darkForeground};
`;

const StyledTypography = styled(Typography)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledRightPaddingArea = styled.div`
  padding-right: ${(props): string =>
    props.theme.spacing(props.theme.space.panelLeft)};
`;

interface ItemNavigatorProps {
  itemSectionType: ItemType | ItemSectionType;
  inspectedTargetId: string;
  inspectedItems: { [refId: string]: ItemData };
  onInspect: (id: string) => void;
}

const ItemNavigator = React.memo((props: ItemNavigatorProps): JSX.Element => {
  const { itemSectionType, inspectedTargetId, inspectedItems, onInspect } =
    props;

  const inspectedItemIds = useMemo(
    () =>
      inspectedItems
        ? Object.values(inspectedItems).map((d) => d.reference.refId)
        : [],
    [inspectedItems]
  );

  const itemHeader = useMemo(
    () => getHeader(itemSectionType),
    [itemSectionType]
  );

  const theme = useTheme();

  const inspectedTargetIds = useMemo(
    () => [inspectedTargetId],
    [inspectedTargetId]
  );

  const onInspectItem = useCallback(
    (reference: ItemReference): void => {
      if (onInspect) {
        onInspect(reference.refId);
      }
    },
    [onInspect]
  );

  const {
    previousItemId,
    nextItemId,
    onPreviousItem: selectPreviousItem,
    onNextItem: selectNextItem,
  } = useItemNavigation(inspectedTargetIds, inspectedItems, onInspectItem);

  return (
    <StyledPaginationArea>
      <StyledTypography variant="caption" style={{ opacity: 0.7 }}>
        {`${inspectedItemIds.indexOf(inspectedTargetId) + 1}/${
          inspectedItemIds.length
        }`}
      </StyledTypography>
      <PanelHeaderIconButton
        aria-label={`Previous ${itemHeader.name}`}
        icon={<AngleLeftRegularIcon />}
        size={theme.fontSize.smallIcon}
        style={previousItemId ? undefined : { opacity: 0.5 }}
        onClick={selectPreviousItem}
      />
      <PanelHeaderIconButton
        aria-label={`Next ${itemHeader.name}`}
        icon={<AngleRightRegularIcon />}
        size={theme.fontSize.smallIcon}
        style={nextItemId ? undefined : { opacity: 0.5 }}
        onClick={selectNextItem}
      />
    </StyledPaginationArea>
  );
});

interface SetupDetailsProps {
  disabled?: boolean;
  id: string;
  doc: GameDocument | ResourceDocument;
  submitting: boolean;
  errors: { [propertyPath: string]: string };
  propertyPaths?: string[];
  expandedProperties: string[];
  onExpandProperty?: (propertyPath: string, expanded: boolean) => void;
  onChange?: (doc: (GameDocument | ResourceDocument)[]) => void;
  onDebouncedChange?: (doc: (GameDocument | ResourceDocument)[]) => void;
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
      ? GameDocumentInspector.instance
      : isResourceDocument(doc)
      ? ResourceDocumentInspector.instance
      : new PageDocumentInspector<GameDocument | ResourceDocument>();
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
        InputComponent={FilledInput}
        ColorInputComponent={ColorInput}
        AutocompleteInputComponent={AutocompleteInput}
        StringInputComponent={StringInput}
        FileInputComponent={FileInput}
        NumberInputComponent={NumberInput}
        BooleanInputComponent={BooleanInput}
        ObjectFieldComponent={ObjectField}
        getPropertyDocIds={handleGetPropertyDocIds}
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
  doc: GameDocument | ResourceDocument;
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
          await new Promise<void>((resolve) =>
            userDispatch(userOnDeleteSubmission(resolve, "games", id))
          );
          if (studioId) {
            router.push(`/e/s/${studioId}?t=games`);
          } else {
            router.push(`/e`);
          }
        }
        if (isResourceDocument(doc)) {
          await new Promise<void>((resolve) =>
            userDispatch(userOnDeleteSubmission(resolve, "resources", id))
          );
          if (studioId) {
            router.push(`/e/s/${studioId}?t=resources`);
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
      if (isResourceDocument(doc)) {
        confirmDialogDispatch(
          confirmDialogNavOpen(
            deleteResourceConfirmationInfo.title,
            format(deleteGameConfirmationInfo.content, {
              name: doc?.name ? `"${doc?.name}"` : "this resource",
            }),
            deleteResourceConfirmationInfo.agreeLabel,
            onAgree,
            deleteResourceConfirmationInfo.disagreeLabel
          )
        );
      }
    },
    [confirmDialogDispatch, doc, id, router, userDispatch]
  );

  const deleteLabel = isGameDocument(doc)
    ? deleteGameLabel
    : isResourceDocument(doc)
    ? deleteResourceLabel
    : undefined;

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
  windowType: DataWindowType;
  open?: boolean;
}

const DetailPanel = React.memo((props: DetailPanelProps): JSX.Element => {
  const { windowType } = props;

  const [scrollParent, setScrollParent] = useState<HTMLDivElement>();

  const [state, dispatch] = useContext(ProjectEngineContext);
  const gameInspector = useContext(GameInspectorContext)?.gameInspector;

  const theme = useTheme();

  const { mode } = state.present.test;
  const { data, id } = state.present.project;
  const doc = state.present.project?.data?.doc;
  const { section } = state.present.dataPanel.panels[windowType].Item;
  const inspectedContainerTargetId =
    state.present.dataPanel.panels[windowType].Item.inspectedTargetId;
  const { inspectedTargetId, inspectedProperties, submitting, errors } =
    state.present.dataPanel.panels[windowType].Detail;

  const stateRef = useRef<GameDocument | ResourceDocument>(doc);

  const inspectedContainers = useInspectedContainers(state.present, windowType);
  const inspectedTargetContainer =
    inspectedContainers?.[inspectedContainerTargetId];
  const inspectedItems: { [refId: string]: ItemData } = useMemo(
    () =>
      section === ItemSectionType.Preview
        ? {}
        : getItems(inspectedTargetContainer, section as ItemType),
    [inspectedTargetContainer, section]
  );

  const allSelectedItemReferences =
    section !== ItemSectionType.Preview
      ? state.present.dataPanel.panels[windowType].Item.interactions.Selected
      : undefined;
  const selectedItemReferences = useMemo(
    () =>
      allSelectedItemReferences
        ? allSelectedItemReferences.filter(
            (r: Reference) => inspectedItems[r.refId] !== undefined
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSelectedItemReferences, JSON.stringify(Object.keys(inspectedItems))]
  );
  const expandedDetailReferences =
    state.present.dataPanel.panels[windowType].Detail.interactions.Expanded;

  const expandedProperties = useMemo(
    () => expandedDetailReferences || [],
    [expandedDetailReferences]
  );

  const selectedItemIds = useMemo(
    () =>
      selectedItemReferences
        ? selectedItemReferences.map((r: Reference) => r.refId)
        : [],
    [selectedItemReferences]
  );
  const selectedItems: { [refId: string]: ItemData } = useMemo(() => {
    const items: { [refId: string]: ItemData } = {};
    if (section === ItemSectionType.Preview || !selectedItemReferences) {
      return items;
    }
    selectedItemReferences.forEach((reference: Reference) => {
      items[reference.refId] = getData(
        reference,
        data as GameProjectData
      ) as ItemData;
    });
    return items;
  }, [section, selectedItemReferences, data]);
  const inspectedInstanceData: InstanceData[] = useMemo(() => {
    if (windowType === DataWindowType.Setup) {
      if (
        section === SetupSectionType.Configuration &&
        isGameProjectData(data)
      ) {
        const config =
          data?.instances?.configs?.data?.[inspectedTargetId as ConfigTypeId];
        if (config) {
          return [config];
        }
      }
      return [];
    }
    const item = inspectedItems?.[inspectedTargetId];
    if (item) {
      return [item];
    }
    return [];
  }, [data, inspectedTargetId, inspectedItems, section, windowType]);

  const panelKey = `${inspectedTargetId}`;

  const inspectedContainerId =
    state.present.dataPanel.panels[windowType].Item.inspectedTargetId;

  const itemHeaderInfo = useMemo(() => getHeader(section), [section]);

  const itemHeaderBreadcrumbs = useMemo(() => {
    return [
      {
        id: itemHeaderInfo.name,
        name:
          selectedItemIds.length > 1
            ? `${itemHeaderInfo.pluralName} (${selectedItemIds.length})`
            : itemHeaderInfo.name,
        interactable: true,
        separator: "|",
      },
    ];
  }, [itemHeaderInfo.name, itemHeaderInfo.pluralName, selectedItemIds.length]);

  const handleClickHeaderBreadcrumb = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (windowType === DataWindowType.Setup) {
        dispatch(dataPanelOpen(windowType, DataPanelType.Setup));
      } else {
        dispatch(dataPanelOpen(windowType, DataPanelType.Item));
      }
    },
    [dispatch, windowType]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (windowType === DataWindowType.Setup) {
        dispatch(dataPanelOpen(windowType, DataPanelType.Setup));
      } else {
        dispatch(dataPanelOpen(windowType, DataPanelType.Item));
      }
    },
    [dispatch, windowType]
  );

  const handleInspect = useCallback(
    (id: string) => {
      dispatch(dataPanelInspect(windowType, DataPanelType.Detail, id));
    },
    [dispatch, windowType]
  );

  const handleDebouncedInstancePropertyChange = useCallback(
    (references: Reference[], propertyPath: string, value: unknown) => {
      // Items are selected, so assume the user is editing the selected items
      if (section !== ItemSectionType.Preview) {
        dispatch(projectUpdateData("Update", references, propertyPath, value));
      }
    },
    [section, dispatch]
  );

  const handleExpandProperty = useCallback(
    (propertyPath: string, expanded: boolean) => {
      if (windowType === DataWindowType.Setup) {
        if (expanded) {
          dispatch(
            dataPanelAddInteraction(
              windowType,
              DataInteractionType.Expanded,
              DataPanelType.Detail,
              [propertyPath]
            )
          );
        } else {
          dispatch(
            dataPanelRemoveInteraction(
              windowType,
              DataInteractionType.Expanded,
              DataPanelType.Detail,
              [propertyPath]
            )
          );
        }
      } else {
        if (section === ItemSectionType.Preview) {
          return;
        }
        if (expanded) {
          dispatch(
            dataPanelAddInteraction(
              windowType,
              DataInteractionType.Expanded,
              DataPanelType.Detail,
              [propertyPath]
            )
          );
        } else {
          dispatch(
            dataPanelRemoveInteraction(
              windowType,
              DataInteractionType.Expanded,
              DataPanelType.Detail,
              [propertyPath]
            )
          );
        }
      }
    },
    [windowType, dispatch, section]
  );

  const handleChange = useCallback(
    (docs: (GameDocument | ResourceDocument)[]) => {
      const newDoc = docs[0];
      stateRef.current = newDoc;
    },
    []
  );

  const handleDebouncedChange = useCallback(
    (docs: (GameDocument | ResourceDocument)[]) => {
      const newDoc = docs[0];
      const collection = isGameDocument(newDoc) ? "games" : "resources";
      dispatch(
        projectChangeDocument(collection, id, {
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
        dispatch(
          dataPanelSetErrors(
            DataWindowType.Setup,
            DataPanelType.Detail,
            newErrors
          )
        );
      }
    },
    [dispatch, errors]
  );

  const handlePropertyErrorFixed = useCallback(
    (propertyPath: string) => {
      if (errors[propertyPath]) {
        const newErrors = { ...errors };
        delete newErrors[propertyPath];
        dispatch(
          dataPanelSetErrors(
            DataWindowType.Setup,
            DataPanelType.Detail,
            newErrors
          )
        );
      }
    },
    [dispatch, errors]
  );

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);

  useEffect(() => {
    if (selectedItems && section !== ItemSectionType.Preview) {
      if (mode === Mode.Edit) {
        // Validate data before inspecting it
        dispatch(projectValidateData(Object.values(selectedItems)));
      }
    }
  }, [selectedItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const inspectedDataName = useMemo(() => {
    if (windowType === DataWindowType.Setup) {
      if (
        section === SetupSectionType.Configuration &&
        isGameProjectData(data)
      ) {
        const config =
          data?.instances?.configs?.data[inspectedTargetId as ConfigTypeId];
        if (config) {
          return gameInspector.getInspector(config.reference).getName(config);
        }
      }
      return getLabel(inspectedTargetId);
    }
    const item = inspectedItems[inspectedTargetId];
    if (item) {
      return gameInspector.getInspector(item.reference).getName(item);
    }
    return "";
  }, [
    data,
    gameInspector,
    inspectedItems,
    inspectedTargetId,
    section,
    windowType,
  ]);

  const handleScrollRef = useCallback((scrollParent: HTMLDivElement): void => {
    setScrollParent(scrollParent);
  }, []);

  return (
    <>
      <Panel
        key={panelKey}
        panelType={PanelType.Detail}
        useWindowAsScrollContainer
        onScrollRef={handleScrollRef}
        topChildren={
          <PanelHeader
            type="default"
            title={inspectedDataName}
            breadcrumbs={itemHeaderBreadcrumbs}
            backIcon={<ArrowLeftRegularIcon />}
            backLabel={`Close`}
            scrollParent={scrollParent}
            onBack={handleClose}
            onBreadcrumb={handleClickHeaderBreadcrumb}
            nameStyle={{ opacity: mode === Mode.Test ? 0.5 : undefined }}
            rightChildren={
              windowType !== DataWindowType.Setup && selectedItemIds ? (
                <ItemNavigator
                  itemSectionType={section as ItemType}
                  inspectedTargetId={inspectedTargetId}
                  inspectedItems={inspectedItems}
                  onInspect={handleInspect}
                />
              ) : undefined
            }
          />
        }
      >
        <StyledList style={{ opacity: mode === Mode.Test ? 0.5 : undefined }}>
          {windowType === DataWindowType.Setup &&
          section === SetupSectionType.Details ? (
            inspectedTargetId === SetupSettingsType.AdvancedSettings ? (
              <SetupAdvanced id={id} doc={doc} />
            ) : (
              <SetupDetails
                disabled={mode === Mode.Test}
                id={id}
                doc={doc}
                submitting={submitting}
                errors={errors}
                propertyPaths={inspectedProperties}
                expandedProperties={expandedProperties as string[]}
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
              InputComponent={FilledInput}
              size="small"
              backgroundColor="white"
              data={inspectedInstanceData}
              disabled={mode === Mode.Test}
              expandedProperties={expandedProperties as string[]}
              inspectedContainerId={inspectedContainerId}
              onExpandProperty={handleExpandProperty}
              onDebouncedPropertyChange={handleDebouncedInstancePropertyChange}
            />
          )}
          <InputBlocker
            active={mode === Mode.Test}
            tooltip={<EditGameTooltipContent />}
          />
        </StyledList>
      </Panel>
    </>
  );
});

export default DetailPanel;
