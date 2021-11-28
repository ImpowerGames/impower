import { ProjectDocument } from "../..";
import { getLabel } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import { removeDuplicates } from "../../../impower-core";
import { DevelopmentStatus } from "../../types/enums/developmentStatus";
import createResourceDocument from "../../utils/createResourceDocument";
import { PageDocumentInspector } from "./pageDocumentInspector";

export class ResourceDocumentInspector extends PageDocumentInspector<ProjectDocument> {
  private static _instance: ResourceDocumentInspector;

  public static get instance(): ResourceDocumentInspector {
    if (!this._instance) {
      this._instance = new ResourceDocumentInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<ProjectDocument>): ProjectDocument {
    return createResourceDocument(data);
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: ProjectDocument,
    value: unknown
  ): string {
    if (propertyPath === "status") {
      if (value !== undefined) {
        return getLabel(value as string);
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  isPropertyDisplayValueInverted(
    propertyPath: string,
    _data: ProjectDocument
  ): boolean {
    if (propertyPath === "restricted") {
      return true;
    }
    return undefined;
  }

  getPropertyLabel(propertyPath: string, data: ProjectDocument): string {
    if (propertyPath === "summary") {
      return "A resource for developers who need...";
    }
    if (propertyPath === "status") {
      return "Development Status";
    }
    if (propertyPath === "restricted") {
      return "All studio members can access this resource";
    }
    return super.getPropertyLabel(propertyPath, data);
  }

  getPropertyOptions(propertyPath: string, data?: ProjectDocument): unknown[] {
    if (propertyPath === "status") {
      return Object.values(DevelopmentStatus);
    }
    if (propertyPath === "tags") {
      const resourceTags = ConfigCache.instance.params?.resourceTags;
      const gameTags = ConfigCache.instance.params?.projectTags;
      return removeDuplicates([
        ...resourceTags.AssetTypes.sort().map((tag) => tag.toLowerCase()),
        ...resourceTags.VisualStyles.sort().map((tag) => tag.toLowerCase()),
        ...resourceTags.MusicStyles.sort().map((tag) => tag.toLowerCase()),
        ...gameTags.Aesthetics.flatMap((x) => x)
          .sort()
          .map((tag) => tag.toLowerCase()),
        ...gameTags.Subjects.flatMap((x) => x).map((tag) => tag.toLowerCase()),
      ]);
    }
    return super.getPropertyOptions(propertyPath, data);
  }

  getPropertyValueGroup(
    propertyPath: string,
    data: ProjectDocument,
    value: string
  ): string {
    if (propertyPath === "tags") {
      const resourceTags = ConfigCache.instance.params?.resourceTags;
      const gameTags = ConfigCache.instance.params?.projectTags;
      if (
        resourceTags.AssetTypes.map((tag) => tag.toLowerCase()).includes(value)
      ) {
        return "Asset Types";
      }
      if (
        resourceTags.VisualStyles.map((tag) => tag.toLowerCase()).includes(
          value
        )
      ) {
        return "Visual Styles";
      }
      if (
        resourceTags.MusicStyles.map((tag) => tag.toLowerCase()).includes(value)
      ) {
        return "Music Styles";
      }
      if (
        gameTags.Aesthetics.flatMap((x) => x)
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "Aesthetics";
      }
      if (
        gameTags.Subjects.flatMap((x) => x)
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "Subjects";
      }
    }
    return undefined;
  }

  getPropertyValueDescription(
    propertyPath: string,
    data: ProjectDocument,
    value: string
  ): string {
    if (propertyPath === "published") {
      if (!value) {
        return "**Only you** can use this resource";
      }
      if (value) {
        return "**Anyone** can use this resource";
      }
    }
    if (propertyPath.endsWith("access")) {
      if (value === "owner") {
        return "Can delete and manage access to the resource";
      }
      if (value === "editor") {
        return "Can edit the resource project";
      }
      if (value === "viewer") {
        return "Can view & download the resource";
      }
    }
    return undefined;
  }

  getPropertyPlaceholder(propertyPath: string, data: ProjectDocument): string {
    if (propertyPath === "description") {
      return `Describe the resource, how it can be used, or anything else.`;
    }
    return super.getPropertyPlaceholder(propertyPath, data);
  }

  isListReorderingDisabled(
    propertyPath: string,
    _data: ProjectDocument
  ): boolean {
    if (propertyPath === "files") {
      return true;
    }
    return undefined;
  }
}
