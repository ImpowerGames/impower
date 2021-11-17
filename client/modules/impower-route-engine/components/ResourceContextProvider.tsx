import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import React, { useCallback, useContext, useEffect, useMemo } from "react";
import { useAllDocs } from "../../impower-data-state";
import { ProjectDocument } from "../../impower-data-store";
import { ResourceProjectData } from "../../impower-game/data";
import {
  NavigationContext,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
} from "../../impower-navigation";
import {
  ProjectEngineSyncContext,
  useProjectData,
  useProjectEngineSyncContextState,
} from "../../impower-project-engine-sync";
import { Fallback } from "../../impower-route";
import PageNotFound from "../../impower-route/components/layouts/PageNotFound";
import { useRouter } from "../../impower-router";
import { useUndoRedo } from "../../impower-undo-redo";
import { useUndoableReducer } from "../../impower-undo-redo/hooks/useUndoableReducer";
import { UserContext } from "../../impower-user";
import { ProjectEngineContext } from "../contexts/projectEngineContext";
import {
  projectAccess,
  projectLoadData,
} from "../types/actions/projectActions";
import {
  projectEngineReducer,
  projectEngineUndoRedoConfig,
} from "../types/reducers/projectEngineReducer";
import { createProjectEngineState } from "../types/state/projectEngineState";

const StyledProjectPage = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${(props): string => props.theme.colors.darkForeground};
  display: flex;
  position: relative;
`;

interface ResourceContextProviderProps {
  children: React.ReactNode;
}

const ResourceContextProvider = React.memo(
  (props: ResourceContextProviderProps) => {
    const { children } = props;

    const router = useRouter();
    const { rid } = router.query;
    const [, navigationDispatch] = useContext(NavigationContext);
    const [userState] = useContext(UserContext);
    const { my_studio_memberships, my_project_memberships } = userState;

    const theme = useTheme();

    const loadedResourceId = Array.isArray(rid) ? rid[0] : rid;

    const projectEngineContext = useUndoableReducer(
      projectEngineReducer,
      createProjectEngineState(),
      projectEngineUndoRedoConfig
    );
    const [projectEngineState, projectEngineDispatch] = projectEngineContext;
    useUndoRedo(projectEngineState, projectEngineDispatch);
    const projectEngineSyncContext = useProjectEngineSyncContextState(
      Boolean(projectEngineState.present.project.id)
    );
    const [projectEngineSyncState] = projectEngineSyncContext;
    const { syncStatusMessage } = projectEngineSyncState;

    const loadedStudioId =
      projectEngineState?.present?.project?.data?.doc?.studio;

    const memberDoc = useMemo(() => {
      if (my_project_memberships === undefined) {
        return undefined;
      }
      if (my_project_memberships === null) {
        return null;
      }
      return my_project_memberships[loadedResourceId];
    }, [loadedResourceId, my_project_memberships]);

    const studioMemberDoc = useMemo(() => {
      if (my_studio_memberships === undefined) {
        return undefined;
      }
      if (my_studio_memberships === null) {
        return null;
      }
      return my_studio_memberships[loadedStudioId];
    }, [loadedStudioId, my_studio_memberships]);

    const recentlyAccessedResourceIds = useMemo(
      () =>
        my_project_memberships === undefined
          ? undefined
          : my_project_memberships === null
          ? null
          : Object.keys(my_project_memberships),
      [my_project_memberships]
    );
    const recentResourceDocs = useAllDocs<ProjectDocument>(
      "projects",
      recentlyAccessedResourceIds
    );

    const handleLoadProjectData = useCallback(
      (data: ResourceProjectData) => {
        projectEngineDispatch(projectLoadData(loadedResourceId, data));
      },
      [projectEngineDispatch, loadedResourceId]
    );
    useProjectData(loadedResourceId, handleLoadProjectData);

    useEffect(() => {
      navigationDispatch(
        navigationSetText(
          "RESOURCE",
          projectEngineState.present.project.data?.doc
            ? projectEngineState.present.project.data?.doc?.name
            : "",
          syncStatusMessage
        )
      );
    }, [
      navigationDispatch,
      syncStatusMessage,
      projectEngineState.present.project.data?.doc,
    ]);

    useEffect(() => {
      const resourceLinks = recentResourceDocs
        ? Object.entries(recentResourceDocs)
            .filter(([key]) => key !== loadedResourceId)
            .map(([key, value]) => ({
              label: value.name,
              link: `/e/g/${key}`,
            }))
        : [];
      navigationDispatch(
        navigationSetLinks([
          ...resourceLinks,
          ...(resourceLinks.length > 0 ? [{ label: "---", link: "" }] : []),
          {
            label: "View All Resources",
            link: `/e/s/${loadedStudioId}?t=resources`,
          },
        ])
      );
      navigationDispatch(navigationSetSearchbar());
    }, [
      navigationDispatch,
      loadedResourceId,
      recentResourceDocs,
      loadedStudioId,
    ]);

    const access =
      memberDoc?.access ||
      (!projectEngineState?.present?.project?.data?.doc?.restricted
        ? studioMemberDoc?.access
        : undefined);

    useEffect(() => {
      projectEngineDispatch(projectAccess(access));
    }, [access, projectEngineDispatch]);

    const loading =
      !access ||
      !loadedStudioId ||
      !loadedResourceId ||
      !projectEngineState.present.project.id ||
      projectEngineState.present.project.data === undefined;

    if (process.env.NEXT_PUBLIC_ENVIRONMENT !== "development") {
      return null;
    }

    if (
      projectEngineState.present.project.id === "" ||
      projectEngineState.present.project.data === null
    ) {
      return (
        <StyledProjectPage>
          <PageNotFound />
        </StyledProjectPage>
      );
    }

    if (loading) {
      return (
        <StyledProjectPage>
          <Fallback
            color="secondary"
            style={{ backgroundColor: theme.colors.darkForeground }}
          />
        </StyledProjectPage>
      );
    }

    return (
      <ProjectEngineSyncContext.Provider value={projectEngineSyncContext}>
        <ProjectEngineContext.Provider value={projectEngineContext}>
          {children}
        </ProjectEngineContext.Provider>
      </ProjectEngineSyncContext.Provider>
    );
  }
);

export default ResourceContextProvider;
