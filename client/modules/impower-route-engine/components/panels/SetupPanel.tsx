import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Button from "@material-ui/core/Button";
import FilledInput from "@material-ui/core/FilledInput";
import Tab from "@material-ui/core/Tab";
import React, {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  GameProjectData,
  SetupSectionType,
  SetupSettingsType,
} from "../../../../../spark-engine";
import { getLabel } from "../../../impower-config";
import {
  getAllErrors,
  getAllVisiblePropertyPaths,
  hexToHsla,
  Timestamp,
} from "../../../impower-core";
import { MemberAccess } from "../../../impower-data-state";
import {
  isGameDocument,
  isProjectDocument,
  PageDocumentInspector,
  ProjectDocument,
  ProjectDocumentInspector,
} from "../../../impower-data-store";
import { NavigationContext } from "../../../impower-navigation";
import {
  DynamicLoadingButton,
  PageNavigationBar,
  Tabs,
} from "../../../impower-route";
import PeerTransition from "../../../impower-route/components/animations/PeerTransition";
import NavigationBarSpacer from "../../../impower-route/components/elements/NavigationBarSpacer";
import InspectorForm from "../../../impower-route/components/forms/InspectorForm";
import AutocompleteInput from "../../../impower-route/components/inputs/AutocompleteInput";
import BooleanInput from "../../../impower-route/components/inputs/BooleanInput";
import PageMembersField, {
  PageMembersFieldProps,
} from "../../../impower-route/components/inputs/PageMembersField";
import Fallback from "../../../impower-route/components/layouts/Fallback";
import useBodyBackgroundColor from "../../../impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../../impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../../../impower-route/hooks/useHTMLOverscrollBehavior";
import { UserContext, userOnChangeMember } from "../../../impower-user";
import { ProjectEngineContext } from "../../contexts/projectEngineContext";
import { WindowTransitionContext } from "../../contexts/transitionContext";
import {
  panelChangeItemSection,
  panelInspect,
  panelOpen,
  panelSetErrors,
  panelSubmit,
} from "../../types/actions/panelActions";
import { projectChangeDocument } from "../../types/actions/projectActions";
import { Mode } from "../../types/state/testState";
import Panel from "../layouts/Panel";

export const sectionLabels: Record<SetupSectionType, string> = {
  details: "Details",
  access: "Access",
  configuration: "Configuration",
};

const settings: { [name in SetupSettingsType]: string[] } = {
  About: ["name", "tags", "summary"],
  Branding: [
    "hex",
    "backgroundHex",
    "icon",
    "preview",
    "cover",
    "logo",
    "logoAlignment",
    "patternScale",
  ],
  Page: ["published", "slug", "description"],
  Screenshots: ["screenshots"],
  Status: ["status", "statusInformation", "version"],
  AdvancedSettings: [],
};

export const editorSetupSections: SetupSectionType[] = ["configuration"];

export const ownerSetupSections: SetupSectionType[] = [
  "details",
  "access",
  "configuration",
];

const StyledSetupPanelContentArea = styled.div`
  display: flex;
  flex-direction: column;
  padding-top: ${(props): string => props.theme.spacing(2)};
  padding-bottom: ${(props): string => props.theme.spacing(2)};
  max-width: ${(props): string => props.theme.spacing(100)};
`;

const StyledSetupPanelContent = styled.div`
  padding-left: ${(props): string => props.theme.spacing(2)};
  padding-right: ${(props): string => props.theme.spacing(2)};

  display: flex;
  flex-direction: column;
`;

const StyledPaddingArea = styled.div`
  padding: ${(props): string => props.theme.spacing(0, 1)};
`;

const StyledPanelContent = styled.div`
  color: ${(props): string => props.theme.colors.white80};
  display: flex;
  flex-direction: column;
  flex: 1;
`;

const StyledSetupArea = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StyledTabsArea = styled.div`
  flex: 100000;
`;

const StyledTabs = styled(Tabs)`
  pointer-events: auto;
  margin-left: ${(props): string => props.theme.spacing(2)};
`;

const StyledTab = styled(Tab)`
  padding: ${(props): string => props.theme.spacing(2, 2)};
  flex: 1;
`;

const StyledHeaderArea = styled.div`
  display: flex;
  flex-wrap: wrap;

  ${(props): string => props.theme.breakpoints.down("md")} {
    flex-direction: column;
  }
`;

const StyledPublishArea = styled.div`
  flex: 1;
  padding: ${(props): string => props.theme.spacing(4, 2)};
`;

const StyledPublishButton = styled(DynamicLoadingButton)`
  min-width: ${(props): string => props.theme.spacing(18)};

  ${(props): string => props.theme.breakpoints.down("sm")} {
    width: 100%;
  }

  &.MuiButton-outlined.Mui-disabled {
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  &.MuiButton-root.Mui-disabled {
    color: rgba(255, 255, 255, 0.26);
  }
`;

const StyledInspectButton = styled(Button)`
  padding: ${(props): string => props.theme.spacing(1, 2)};
  justify-content: flex-start;
  text-transform: none;
  font-size: 1rem;
  line-height: 1.5;
  font-weight: 400;
  min-height: 56px;
`;

const StyledFilledInput = styled(FilledInput)`
  border-radius: ${(props): string => props.theme.spacing(1)};
`;

export const AccessField = (
  props: PageMembersFieldProps
): JSX.Element | null => {
  const { propertyPath } = props;
  if (propertyPath === "members") {
    return <PageMembersField {...props} />;
  }
  return null;
};

const DetailsSetup = React.memo(() => {
  const [, dispatch] = useContext(ProjectEngineContext);

  const handleClick = useCallback(
    (type: string, propertyPaths: string[]) => {
      dispatch(panelInspect("setup", type, propertyPaths));
      dispatch(panelOpen("setup", "detail"));
    },
    [dispatch]
  );

  return (
    <>
      {Object.entries(settings).map(([type, propertyPaths]) => (
        <StyledInspectButton
          color="inherit"
          key={type}
          onClick={(): void => handleClick(type, propertyPaths)}
        >
          {getLabel(type)}
        </StyledInspectButton>
      ))}
    </>
  );
});

const ConfigurationSetup = React.memo(() => {
  const [state, dispatch] = useContext(ProjectEngineContext);

  const project = state.project.data as GameProjectData;

  const configs = {
    ScaleConfig: {
      reference: {
        refTypeId: "ScaleConfig",
        refId: "ScaleConfig",
      },
      mode: "HeightControlsWidth",
      autoCenter: "CenterBoth",
      width: 1920,
      height: 1080,
    },
    BackgroundConfig: {
      reference: {
        refTypeId: "BackgroundConfig",
        refId: "BackgroundConfig",
      },
      game: hexToHsla("#000000FF"),
      screen: hexToHsla("#021830FF"),
      ui: hexToHsla("#00000000"),
    },
    SaveConfig: {
      reference: {
        refTypeId: "SaveConfig",
        refId: "SaveConfig",
      },
      autoSaveOnEnter: true,
    },
    PhysicsConfig: {
      reference: {
        refTypeId: "PhysicsConfig",
        refId: "PhysicsConfig",
      },
      time: { fps: 60, timeScale: 1 },
      gravity: { x: 0, y: 0 },
      collisionBounds: {
        active: false,
        value: { position: { x: 0, y: 0 }, size: { width: 200, height: 200 } },
      },
      checkCollision: { up: true, down: true, left: true, right: true },
      collisionBiases: { overlapBias: 4, tileBias: 16, forceX: false },
      debugDisplay: {
        active: false,
        value: {
          bodyColor: {
            active: true,
            value: { h: 300, s: 1, l: 0.5, a: 1 },
          },
          staticBodyColor: {
            active: true,
            value: { h: 240, s: 1, l: 0.5, a: 1 },
          },
          velocityColor: {
            active: true,
            value: { h: 120, s: 1, l: 0.5, a: 1 },
          },
        },
      },
      dynamicBodiesTree: {
        active: true,
        value: {
          maxEntries: 16,
        },
      },
    },
    DebugConfig: {
      reference: {
        refTypeId: "DebugConfig",
        refId: "DebugConfig",
      },
      randomizationSeed: "",
      logBlockExecutions: false,
    },
    AdvancedConfig: {
      reference: {
        refTypeId: "AdvancedConfig",
        refId: "AdvancedConfig",
      },
      autoCreateConstructs: true,
    },
    ...project?.instances?.configs?.data,
  };

  const handleClick = useCallback(
    (refId: string) => {
      dispatch(panelInspect("setup", refId));
      dispatch(panelOpen("setup", "detail"));
    },
    [dispatch]
  );

  return (
    <>
      {Object.entries(configs).map(
        ([k, d]) =>
          d.reference.refId && (
            <StyledInspectButton
              color="inherit"
              key={d.reference.refId}
              onClick={(): void => handleClick(d.reference.refId)}
            >
              {getLabel(k)}
            </StyledInspectButton>
          )
      )}
    </>
  );
});

interface AccessSetupProps {
  mode: Mode;
  submitting?: boolean;
  onChange: (doc: ProjectDocument) => void;
  onDebouncedChange: (doc: ProjectDocument) => void;
}

const AccessSetup = React.memo((props: AccessSetupProps) => {
  const { mode, submitting, onChange, onDebouncedChange } = props;

  const [, userDispatch] = useContext(UserContext);
  const [state] = useContext(ProjectEngineContext);

  const id = state?.project?.id;
  const doc = state?.project?.data?.doc;
  const memberDocs = state?.project?.data?.members?.data;

  const handleGetInspector = useCallback(() => {
    return ProjectDocumentInspector.instance;
  }, []);

  const handleGetPropertyDocIds = useCallback(() => [id], [id]);

  const handleEditMember = useCallback(
    async (
      action: "create" | "update" | "delete",
      uid: string,
      access?: MemberAccess
    ) => {
      const timestampServerValue = (
        await import("../../../impower-data-state/utils/timestampServerValue")
      ).default;
      if (uid) {
        switch (action) {
          case "create":
            if (isProjectDocument(doc)) {
              await new Promise<void>((resolve) => {
                userDispatch(
                  userOnChangeMember(
                    resolve,
                    {
                      g: "projects",
                      access,
                      role: "",
                      t: timestampServerValue() as number,
                    },
                    "projects",
                    id,
                    "members",
                    "data",
                    uid
                  )
                );
              });
            }
            break;
          case "update":
            if (isProjectDocument(doc)) {
              await new Promise<void>((resolve) => {
                userDispatch(
                  userOnChangeMember(
                    resolve,
                    {
                      g: "projects",
                      access,
                      role: "",
                    },
                    "projects",
                    id,
                    "members",
                    "data",
                    uid
                  )
                );
              });
            }
            break;
          case "delete":
            if (isProjectDocument(doc)) {
              await new Promise<void>((resolve) => {
                userDispatch(
                  userOnChangeMember(
                    resolve,
                    null,
                    "projects",
                    id,
                    "members",
                    "data",
                    uid
                  )
                );
              });
            }
            break;
          default:
            break;
        }
      }
    },
    [doc, id, userDispatch]
  );

  const handleAddMember = useCallback(
    async (uid: string) => {
      handleEditMember("create", uid, MemberAccess.Editor);
    },
    [handleEditMember]
  );

  const handleUpdateMember = useCallback(
    async (uid: string, access: "Remove" | MemberAccess) => {
      if (access === "Remove") {
        handleEditMember("delete", uid);
      } else {
        handleEditMember("update", uid, access);
      }
    },
    [handleEditMember]
  );

  const handleChange = useCallback(
    (docs: ProjectDocument[]) => {
      if (onChange) {
        onChange(docs[0]);
      }
    },
    [onChange]
  );

  const handleDebouncedChange = useCallback(
    (docs: ProjectDocument[]) => {
      if (onDebouncedChange) {
        onDebouncedChange(docs[0]);
      }
    },
    [onDebouncedChange]
  );

  const data = useMemo(() => [doc], [doc]);

  const propertyPaths = useMemo(() => ["restricted", "members"], []);

  const renderPropertyProps = useMemo(
    () => ({
      memberDocs,
      onAddMember: handleAddMember,
      onUpdateMember: handleUpdateMember,
    }),
    [handleAddMember, handleUpdateMember, memberDocs]
  );

  return (
    <StyledPaddingArea>
      <InspectorForm
        variant="filled"
        inset
        InputComponent={StyledFilledInput}
        AutocompleteInputComponent={AutocompleteInput}
        BooleanInputComponent={BooleanInput}
        size="medium"
        backgroundColor="white"
        propertyPaths={propertyPaths}
        spacing={8}
        disabled={mode === "Test"}
        submitting={submitting}
        data={data}
        getPropertyDocPaths={handleGetPropertyDocIds}
        getInspector={handleGetInspector}
        onChange={handleChange}
        onDebouncedChange={handleDebouncedChange}
        renderProperty={AccessField}
        renderPropertyProps={renderPropertyProps}
      />
    </StyledPaddingArea>
  );
});

const SetupPanel = React.memo((): JSX.Element => {
  const [state, dispatch] = useContext(ProjectEngineContext);
  const { portrait } = useContext(WindowTransitionContext);
  const id = state.project?.id;
  const doc = state.project?.data?.doc;
  const access = state?.project?.access;
  const mode = state.test?.mode;
  const panelState = state?.panel?.panels?.setup;
  const submitting = panelState?.submitting;
  const errors = panelState?.errors;
  const section = panelState?.section;

  const [navigationState] = useContext(NavigationContext);
  const theme = useTheme();
  const [tabIndex, setTabIndex] = useState(0);
  const [previousTabIndex, setPreviousTabIndex] = useState(-1);

  const stateRef = useRef<ProjectDocument>(doc);

  const setupSections = useMemo(() => {
    const sections =
      access === MemberAccess.Owner
        ? ownerSetupSections
        : access === MemberAccess.Editor
        ? editorSetupSections
        : [];
    return sections.filter(
      (section) => isGameDocument(doc) || section !== "configuration"
    );
  }, [access, doc]);

  const setupTabIndex = setupSections.findIndex((s) => s === section);
  const validSetupTabIndex =
    setupTabIndex >= 0 && setupTabIndex < setupSections.length
      ? setupTabIndex
      : 0;

  const type = setupSections[validSetupTabIndex];

  const handleTabChange = useCallback(
    (event: React.ChangeEvent, newValue: number): void => {
      dispatch(panelChangeItemSection("setup", setupSections[newValue]));
      setTabIndex(newValue);
      setPreviousTabIndex(validSetupTabIndex);
    },
    [dispatch, setupSections, validSetupTabIndex]
  );

  useBodyBackgroundColor(theme.colors.darkForeground);
  useHTMLBackgroundColor(theme.colors.darkForeground);
  useHTMLOverscrollBehavior("contain");

  const handleSubmit = useCallback(
    async (e: React.FormEvent | React.MouseEvent) => {
      const currentData = stateRef.current;
      e.preventDefault();
      dispatch(panelSubmit("setup", true));
      const createPageDocument = (
        await import("../../../impower-data-store/utils/createPageDocument")
      ).default;
      const errors = isGameDocument(currentData)
        ? await getAllErrors(
            getAllVisiblePropertyPaths(
              currentData,
              ProjectDocumentInspector.instance.isPropertyVisible,
              ProjectDocumentInspector.instance.createData
            ),
            currentData,
            ProjectDocumentInspector.instance.getPropertyError,
            () => [id]
          )
        : await getAllErrors(
            getAllVisiblePropertyPaths(
              currentData,
              new PageDocumentInspector<ProjectDocument>().isPropertyVisible,
              createPageDocument
            ),
            currentData,
            new PageDocumentInspector<ProjectDocument>().getPropertyError,
            () => [id]
          );
      dispatch(panelSetErrors("setup", errors));
      if (Object.keys(errors).length === 0) {
        dispatch(
          projectChangeDocument(id, {
            ...currentData,
            published: true,
            ...(currentData?.published
              ? { republishedAt: new Timestamp() }
              : { publishedAt: new Timestamp() }),
          })
        );
        await new Promise((resolve) => {
          window.setTimeout(resolve, 2000);
        });
      }
      dispatch(panelSubmit("setup", false));
    },
    [dispatch, id]
  );

  const handleChange = useCallback((newDoc: ProjectDocument) => {
    stateRef.current = newDoc;
  }, []);

  const handleDebouncedChange = useCallback(
    async (newDoc: ProjectDocument) => {
      dispatch(
        projectChangeDocument(id, {
          ...stateRef.current,
          ...newDoc,
        })
      );
    },
    [dispatch, id]
  );

  if (!type) {
    return (
      <Fallback
        color="secondary"
        style={{ backgroundColor: theme.colors.darkForeground }}
      />
    );
  }

  return (
    <>
      <Panel
        useWindowAsScrollContainer={portrait}
        topChildren={
          portrait ? (
            <>
              <NavigationBarSpacer />
              <PageNavigationBar
                title=""
                secondaryTitle={navigationState.secondaryTitle}
                subtitle={navigationState.subtitle}
                titleLinks={navigationState.links}
                elevation={navigationState.elevation}
                backgroundColor={navigationState.backgroundColor}
                appBarPosition="fixed"
              />
            </>
          ) : undefined
        }
      >
        <StyledPanelContent>
          {setupSections?.length > 1 && (
            <StyledHeaderArea>
              <StyledTabsArea>
                <StyledTabs
                  value={validSetupTabIndex}
                  indicatorColor="white"
                  onChange={handleTabChange}
                >
                  {setupSections.map((section, index) => (
                    <StyledTab
                      key={section}
                      value={index}
                      label={sectionLabels[section]}
                    />
                  ))}
                </StyledTabs>
              </StyledTabsArea>
            </StyledHeaderArea>
          )}
          <StyledSetupArea>
            <PeerTransition
              currentIndex={tabIndex}
              previousIndex={previousTabIndex}
              ease="ease-in-out"
              style={{ display: "flex", flexDirection: "column" }}
            >
              <StyledSetupPanelContentArea>
                {type === "details" && (
                  <StyledSetupPanelContent>
                    <DetailsSetup />
                    <StyledPublishArea>
                      <StyledPublishButton
                        loading={submitting}
                        variant="outlined"
                        color="inherit"
                        disabled={errors && Object.keys(errors).length > 0}
                        onClick={handleSubmit}
                      >
                        {`Publish`}
                      </StyledPublishButton>
                    </StyledPublishArea>
                  </StyledSetupPanelContent>
                )}
                {type === "configuration" && (
                  <StyledSetupPanelContent>
                    <ConfigurationSetup />
                  </StyledSetupPanelContent>
                )}
                {type === "access" && (
                  <StyledSetupPanelContent>
                    <AccessSetup
                      mode={mode}
                      submitting={submitting}
                      onChange={handleChange}
                      onDebouncedChange={handleDebouncedChange}
                    />
                  </StyledSetupPanelContent>
                )}
              </StyledSetupPanelContentArea>
            </PeerTransition>
          </StyledSetupArea>
        </StyledPanelContent>
      </Panel>
    </>
  );
});

export default SetupPanel;
