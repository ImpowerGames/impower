import { useEffect, useRef } from "react";
import { ProjectDocument } from "../../impower-data-store";
import {
  GameInstancesCollection,
  GameScriptsCollection,
  MembersCollection,
} from "../../impower-game/data";
import { ProjectEngineSync } from "../types/classes/projectEngineSync";

export const useProjectData = (
  projectId: string,
  onLoadDoc?: (doc: ProjectDocument) => void,
  onLoadMembers?: (doc: MembersCollection) => void,
  onLoadScripts?: (doc: GameScriptsCollection) => void,
  onLoadInstances?: (doc: GameInstancesCollection) => void
): void => {
  const unsubscribeDocRef = useRef<() => void>();
  const unsubscribeMembersRef = useRef<() => void>();
  const unsubscribeScriptsRef = useRef<() => void>();
  const unsubscribeInstancesRef = useRef<() => void>();

  useEffect(() => {
    if (projectId === undefined) {
      return (): void => null;
    }

    if (!projectId) {
      onLoadDoc?.(null);
      onLoadMembers?.(null);
      onLoadScripts?.(null);
      onLoadInstances?.(null);
      return (): void => null;
    }

    ProjectEngineSync.instance
      .observeDoc(
        (v) => {
          onLoadDoc?.(v);
        },
        "projects",
        projectId
      )
      .then((unsubscribe) => {
        unsubscribeDocRef.current = unsubscribe;
      });
    ProjectEngineSync.instance
      .observeMembers(
        (v) => {
          onLoadMembers?.(v);
        },
        "projects",
        projectId
      )
      .then((unsubscribe) => {
        unsubscribeMembersRef.current = unsubscribe;
      });
    ProjectEngineSync.instance
      .observeScripts(
        (v) => {
          onLoadScripts?.(v);
        },
        "projects",
        projectId
      )
      .then((unsubscribe) => {
        unsubscribeScriptsRef.current = unsubscribe;
      });
    ProjectEngineSync.instance
      .observeInstances(
        (v) => {
          onLoadInstances?.(v);
        },
        "projects",
        projectId
      )
      .then((unsubscribe) => {
        unsubscribeInstancesRef.current = unsubscribe;
      });
    return (): void => {
      if (unsubscribeDocRef.current) {
        unsubscribeDocRef.current();
      }
      if (unsubscribeMembersRef.current) {
        unsubscribeMembersRef.current();
      }
      if (unsubscribeScriptsRef.current) {
        unsubscribeScriptsRef.current();
      }
      if (unsubscribeInstancesRef.current) {
        unsubscribeInstancesRef.current();
      }
    };
  }, [onLoadDoc, onLoadInstances, onLoadMembers, onLoadScripts, projectId]);
};
