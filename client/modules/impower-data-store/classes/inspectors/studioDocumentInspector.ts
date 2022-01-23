import { getLabel } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import { StudioDocument } from "../../types/documents/studioDocument";
import { DeveloperStatus } from "../../types/enums/developerStatus";
import createStudioDocument from "../../utils/createStudioDocument";
import { PageDocumentInspector } from "./pageDocumentInspector";

export class StudioDocumentInspector extends PageDocumentInspector<StudioDocument> {
  private static _instance: StudioDocumentInspector;

  public static get instance(): StudioDocumentInspector {
    if (!this._instance) {
      this._instance = new StudioDocumentInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<StudioDocument>): StudioDocument {
    return createStudioDocument(data);
  }

  getPropertyLabel(propertyPath: string, data: StudioDocument): string {
    if (propertyPath === "tags") {
      return "Specialties";
    }
    if (propertyPath === "neededRoles") {
      return "Looking For";
    }
    if (propertyPath === "status") {
      return "Development Status";
    }
    if (propertyPath === "summary") {
      return "Description";
    }
    return super.getPropertyLabel(propertyPath, data);
  }

  getPropertyDisplayValue(
    propertyPath: string,
    data: StudioDocument,
    value: unknown
  ): string {
    if (propertyPath === "status" || propertyPath === "neededRoles") {
      if (value !== undefined) {
        return getLabel(value as string);
      }
    }
    return super.getPropertyDisplayValue(propertyPath, data, value);
  }

  getPropertyValueGroup(
    propertyPath: string,
    data: StudioDocument,
    value: string
  ): string {
    if (propertyPath === "tags") {
      const gameTags = ConfigCache.instance.params?.projectTags;
      if (
        gameTags.Mechanics.flatMap((x) => x)
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "Mechanics";
      }
      if (
        gameTags.Genres.flatMap((x) => x)
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "Genres";
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

  getPropertyOptions(propertyPath: string, data?: StudioDocument): unknown[] {
    if (propertyPath === "status") {
      return Object.values(DeveloperStatus);
    }
    if (propertyPath === "neededRoles") {
      const roleTags = ConfigCache.instance.params?.roleTags?.roles;
      if (roleTags) {
        return roleTags.sort();
      }
    }
    if (propertyPath === "tags") {
      const gameTags = ConfigCache.instance.params?.projectTags;
      return [
        ...gameTags.Mechanics.flatMap((x) => x)
          .sort()
          .map((tag) => tag.toLowerCase()),
        ...gameTags.Genres.flatMap((x) => x)
          .sort()
          .map((tag) => tag.toLowerCase()),
        ...gameTags.Aesthetics.flatMap((x) => x)
          .sort()
          .map((tag) => tag.toLowerCase()),
        ...gameTags.Subjects.flatMap((x) => x)
          .sort()
          .map((tag) => tag.toLowerCase()),
      ];
    }
    return super.getPropertyOptions(propertyPath, data);
  }

  getPropertyValueDescription(
    propertyPath: string,
    data: StudioDocument,
    value: string
  ): string {
    if (propertyPath.endsWith("access")) {
      if (value === "owner") {
        return "Can delete and manage access to the studio";
      }
      if (value === "editor") {
        return "Can edit the studio & its members";
      }
      if (value === "viewer") {
        return "Can view, play, & download the studio's games or resources";
      }
    }
    return undefined;
  }

  getPropertyPlaceholder(propertyPath: string, data: StudioDocument): string {
    if (propertyPath === "tags") {
      return `Maximum ${this.getPropertyListCountLimit(
        propertyPath,
        data
      )} specialties`;
    }
    if (propertyPath === "description") {
      return `Describe the studio's members, goals, or anything else.`;
    }
    return super.getPropertyPlaceholder(propertyPath, data);
  }

  getPropertyListCountLimit(
    propertyPath: string,
    data: StudioDocument
  ): number {
    if (propertyPath === "neededRoles") {
      return 10;
    }
    return super.getPropertyListCountLimit(propertyPath, data);
  }
}
