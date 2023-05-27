import { capitalize, getLabel } from "../../../impower-config";
import ConfigCache from "../../../impower-config/classes/configCache";
import format from "../../../impower-config/utils/format";
import {
  Inspector,
  isCollection,
  removeDuplicates,
} from "../../../impower-core";
import { PageDocument } from "../../types/documents/pageDocument";
import { Alignment } from "../../types/enums/alignment";
import { DeveloperStatus } from "../../types/enums/developerStatus";
import { DevelopmentStatus } from "../../types/enums/developmentStatus";
import getSlugRoute from "../../utils/getSlugRoute";
import getTypeName from "../../utils/getTypeName";

export class PageDocumentInspector<T extends PageDocument>
  implements Inspector<T>
{
  validate(data: T): T {
    return {
      ...data,
      tags: removeDuplicates(
        data.tags.flatMap((a) =>
          a
            ?.trim()
            .split(/\s*[#,]\s*/)
            .map((x) => x.toLowerCase().replace(/[#,]/g, ""))
        )
      ).slice(0, this.getPropertyListCountLimit("tags", data)),
    };
  }

  isPropertyVisible(propertyPath: string, data: T): boolean {
    if (propertyPath === "reviews") {
      return false;
    }
    if (propertyPath === "comments") {
      return false;
    }
    if (propertyPath === "studios") {
      return false;
    }
    if (propertyPath === "statusInformation") {
      if (
        data.status === DevelopmentStatus.Launched ||
        data.status === DeveloperStatus.Active
      ) {
        return false;
      }
    }
    return undefined;
  }

  isPropertyRequired(propertyPath: string, data: T): boolean {
    if (propertyPath === "name") {
      return true;
    }
    if (propertyPath === "slug") {
      if (data.slug !== undefined) {
        return true;
      }
    }
    if (propertyPath === "handle") {
      if (data.handle !== undefined) {
        return true;
      }
    }
    if (propertyPath === "version") {
      if (
        data.status === DevelopmentStatus.EarlyAccess ||
        data.status === DevelopmentStatus.Launched
      ) {
        return true;
      }
    }
    if (propertyPath === "statusInformation") {
      if (
        data.status === DevelopmentStatus.EarlyAccess ||
        data.status === DevelopmentStatus.Hiatus ||
        data.status === DevelopmentStatus.Cancelled
      ) {
        return true;
      }
    }
    return undefined;
  }

  async getPropertyError(
    propertyPath: string,
    data: T,
    value: unknown,
    _docIds: string[]
  ): Promise<string | null> {
    if (propertyPath === "slug") {
      if (typeof value === "string" && value) {
        const slugHasOnlyValidCharacters = /^[a-zA-Z0-9_]+$/.test(value);
        if (!slugHasOnlyValidCharacters) {
          return "Slug must only contain lowercase alphanumeric characters or underscores.";
        }
      }
    }
    if (this?.isPropertyRequired?.(propertyPath, data)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return `Select at least one`;
        }
      }
      if (isCollection(value)) {
        if (Object.keys(value.data).length === 0) {
          return `Select at least one`;
        }
      }
      if (!value) {
        return `${this?.getPropertyLabel(propertyPath, data)} is required`;
      }
    }
    return undefined;
  }

  getPropertyLabel(propertyPath: string, _data: T): string {
    if (propertyPath === "hex") {
      return "Main Color";
    }
    if (propertyPath === "backgroundHex") {
      return "Background Color";
    }
    if (propertyPath === "members") {
      return "";
    }
    return undefined;
  }

  getPropertyDisplayValue(
    propertyPath: string,
    _data: T,
    value: unknown
  ): string {
    if (propertyPath === "logoAlignment" || propertyPath.endsWith("access")) {
      if (value !== undefined) {
        return getLabel(value as string);
      }
    }
    if (propertyPath === "tags") {
      const tag = (value as string) || "";
      return capitalize(tag);
    }
    return undefined;
  }

  getPropertyValueIcon(propertyPath: string, _data: T, value: string): string {
    if (propertyPath === "tags") {
      const tagIconNames = ConfigCache.instance.params?.tagIconNames;
      const tag = ((value as string) || "")?.toLowerCase();
      const tagDisambiguations =
        ConfigCache.instance.params?.tagDisambiguations;
      const validTag = tagDisambiguations[tag]?.[0] || tag || "";
      const tagIconName = tagIconNames?.[validTag];
      if (tagIconName) {
        return tagIconName;
      }
      const moods = ConfigCache.instance.params?.moods;
      const archetypes = ConfigCache.instance.params?.archetypes;
      if (
        moods &&
        Object.values(moods)
          .flatMap((x) => x.flatMap((y) => y))
          .map((tag) => tag.toLowerCase())
          .includes(value)
      ) {
        return "masks-theater";
      }
      if (
        archetypes &&
        archetypes.map((tag) => tag.toLowerCase()).includes(value)
      ) {
        return "person";
      }
      return "hashtag";
    }
    return undefined;
  }

  getPropertyValueIconStyle(
    propertyPath: string,
    _data: T,
    _value: unknown
  ): { color?: string; fontSize?: string | number } {
    if (propertyPath === "tags") {
      return { fontSize: 18 };
    }
    if (propertyPath === "pitchGoal") {
      return { fontSize: 20 };
    }
    return undefined;
  }

  getPropertyOptions(propertyPath: string, _data?: T): unknown[] {
    if (propertyPath.endsWith("access")) {
      return ["owner", "editor", "viewer"];
    }
    if (propertyPath === "logoAlignment") {
      return Object.values(Alignment);
    }
    return undefined;
  }

  getPropertyListCountLimit(propertyPath: string, _data: T): number {
    if (propertyPath === "tags") {
      return 10;
    }
    if (propertyPath === "screenshots") {
      return 10;
    }
    return undefined;
  }

  getPropertyPlaceholder(propertyPath: string, data: T): string {
    if (propertyPath === "name" || propertyPath === "slug") {
      return `Maximum ${this.getPropertyCharacterCountLimit(
        propertyPath,
        data
      )} characters`;
    }
    if (propertyPath === "statusInformation") {
      if (data.status === DevelopmentStatus.InDevelopment) {
        return "Describe what you are currently working on.";
      }
      if (data.status === DevelopmentStatus.EarlyAccess) {
        return format(
          `Describe why you are releasing this {doc} in Early Access, how long you expect it to be in Early Access, and how the community can participate in the development process.`,
          {
            doc: getTypeName(data._documentType).toLowerCase(),
          }
        );
      }
      if (data.status === DevelopmentStatus.Hiatus) {
        return "Describe why you are taking a hiatus and/or approximately how long it will last.";
      }
      if (data.status === DevelopmentStatus.Cancelled) {
        return format(
          "Describe why the development of this {doc} has been cancelled.",
          {
            doc: getTypeName(data._documentType).toLowerCase(),
          }
        );
      }
      return format("Describe the current status of the {doc}.", {
        doc: getTypeName(data._documentType).toLowerCase(),
      });
    }
    if (propertyPath === "members") {
      return `Add members by username`;
    }
    if (propertyPath === "studio") {
      return `Search studios by handle`;
    }
    if (propertyPath === "tags") {
      return `Search mechanics, genres, or subjects`;
    }
    return undefined;
  }

  getPropertyMoreInfoPopup(
    propertyPath: string,
    data: T
  ): {
    icon?: string;
    title?: string;
    description?: string;
    caption?: string;
    alignment?: "flex-start" | "center" | "flex-end";
  } {
    if (propertyPath === "slug") {
      const docType = data._documentType;
      const doc = getTypeName(docType).toLowerCase();
      const s = getSlugRoute(docType).toLowerCase();
      const slug = data.slug || "your-slug-here";
      return {
        icon: "question-circle",
        title: "What is a slug?",
        description: format(
          `A slug is a short, unique identifier for your {doc}.
      It is used in the url for your public {doc} page.`,
          { doc }
        ),
        caption: format("impower.app/{s}/{slug}", {
          s,
          slug,
        }),
      };
    }
    if (propertyPath === "handle") {
      const docType = data._documentType;
      const doc = getTypeName(docType).toLowerCase();
      const s = getSlugRoute(docType).toLowerCase();
      const handle = data.handle || "your-handle-here";
      return {
        icon: "question-circle",
        title: "What is a handle?",
        description: format(
          `A handle is a short, unique identifier for your {doc}.
      People can use it to find and mention your {doc}.`,
          { doc }
        ),
        caption: format("@{handle}", { s, handle }),
      };
    }
    if (propertyPath === "version") {
      return {
        icon: "question-circle",
        title: "Semantic Versioning",
        description: `
Status          | Update | Example |
--------------- | ------ | ------- |
First Launch    | 1.0.0  | 1.0.0   |
Minor bug fixes | 1.0._  | 1.0.2   |
Minor changes   | 1._.0  | 1.2.0   |
Major changes   | _.0.0  | 2.0.0   |
`,
        alignment: "center",
      };
    }
    return undefined;
  }

  getPropertyCharacterCountLimit(propertyPath: string, _data: T): number {
    if (propertyPath === "tags") {
      return 140;
    }
    if (propertyPath === "name") {
      return 50;
    }
    if (propertyPath === "slug") {
      return 50;
    }
    if (propertyPath === "summary") {
      return 300;
    }
    if (propertyPath === "statusInformation") {
      return 3000;
    }
    if (propertyPath === "description") {
      return 8000;
    }
    return undefined;
  }

  isPropertyCharacterCounterVisible(propertyPath: string, _data: T): boolean {
    if (propertyPath === "summary") {
      return true;
    }
    return undefined;
  }

  getPropertyDebounceInterval(propertyPath: string, _data: T): number {
    if (propertyPath === "version") {
      return 1000;
    }
    if (propertyPath === "slug") {
      return 1000;
    }
    return undefined;
  }

  isPropertyMarkdown(propertyPath: string, _data: T): boolean {
    if (propertyPath === "description") {
      return true;
    }
    if (propertyPath === "statusInformation") {
      return true;
    }
    return undefined;
  }

  isPropertyMultiline(propertyPath: string, _data: T): boolean {
    if (propertyPath === "summary") {
      return true;
    }
    if (propertyPath === "description") {
      return true;
    }
    if (propertyPath === "statusInformation") {
      return true;
    }
    return undefined;
  }

  getPropertyTextTransform(
    propertyPath: string,
    _data: T
  ): "uppercase" | "lowercase" | undefined {
    if (propertyPath === "slug") {
      return "lowercase";
    }
    return undefined;
  }

  getPropertyInputType(
    propertyPath: string,
    _data?: T
  ):
    | "button"
    | "checkbox"
    | "color"
    | "date"
    | "datetime-local"
    | "email"
    | "file"
    | "hidden"
    | "image"
    | "month"
    | "number"
    | "password"
    | "radio"
    | "range"
    | "reset"
    | "search"
    | "submit"
    | "tel"
    | "text"
    | "time"
    | "url"
    | "week" {
    if (propertyPath === "hex") {
      return "color";
    }
    if (propertyPath === "backgroundHex") {
      return "color";
    }
    return undefined;
  }

  getPropertyBounds(
    propertyPath: string,
    _data: T
  ): {
    min?: number;
    max?: number;
    step?: number | null;
    marks?: { value: number; label: string }[];
    force?: boolean;
    disableArbitraryInput?: boolean;
  } {
    if (propertyPath === "patternScale") {
      return {
        min: 0,
        max: 1,
        step: 0.01,
        disableArbitraryInput: true,
      };
    }
    return undefined;
  }
}
