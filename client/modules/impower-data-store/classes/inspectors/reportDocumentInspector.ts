import { getLabel } from "../../../impower-config";
import { Inspector } from "../../../impower-core";
import { ReportDocument } from "../../types/documents/reportDocument";
import { ReportReason } from "../../types/enums/reportReason";
import createReportDocument from "../../utils/createReportDocument";

export class ReportDocumentInspector implements Inspector<ReportDocument> {
  private static _instance: ReportDocumentInspector;

  public static get instance(): ReportDocumentInspector {
    if (!this._instance) {
      this._instance = new ReportDocumentInspector();
    }
    return this._instance;
  }

  createData(data?: Partial<ReportDocument>): ReportDocument {
    return createReportDocument(data);
  }

  getPropertyLabel(propertyPath: string, _data: ReportDocument): string {
    if (propertyPath === "content") {
      return "Additional Information";
    }
    return undefined;
  }

  isPropertyRequired(propertyPath: string, _data: ReportDocument): boolean {
    if (propertyPath === "reason") {
      return true;
    }
    return undefined;
  }

  getPropertyDisplayValue(
    propertyPath: string,
    _data: ReportDocument,
    value: unknown
  ): string {
    if (propertyPath === "reason") {
      return getLabel(value as string);
    }
    return undefined;
  }

  getPropertyOptions(propertyPath: string, _data?: ReportDocument): unknown[] {
    if (propertyPath === "reason") {
      return Object.values(ReportReason);
    }
    return undefined;
  }

  getPropertyValueDescription(
    propertyPath: string,
    _data: ReportDocument,
    value: unknown
  ): string {
    if (propertyPath === "reason") {
      if (value === "Spam") {
        return "It is spam";
      }
      if (value === "Unattributed") {
        return "It uses an asset without required attribution";
      }
      if (value === "Infrigement") {
        return "It infringes copyright or trademark rights";
      }
      if (value === "Harrassment") {
        return "It abuses or harasses someone";
      }
      if (value === "Misinformation") {
        return "It spreads misinformation";
      }
      if (value === "PrivacyViolation") {
        return "It violates someone's privacy";
      }
      if (value === "IllegalTransaction") {
        return "It is a transaction for prohibited goods or services";
      }
      if (value === "SelfHarm") {
        return "Someone is considering suicide or self-harm";
      }
      if (value === "UntaggedMatureContent") {
        return "It contains mature or explicit content but is not tagged appropriately";
      }
      if (value === "InvoluntaryPornography") {
        return "It is involuntary pornography";
      }
    }
    return undefined;
  }

  getPropertyCharacterCountLimit(
    propertyPath: string,
    _data: ReportDocument
  ): number {
    if (propertyPath === "content") {
      return 500;
    }
    return undefined;
  }

  isPropertyMultiline(propertyPath: string, _data: ReportDocument): boolean {
    if (propertyPath === "content") {
      return true;
    }
    return undefined;
  }

  isPropertyCharacterCounterVisible(
    propertyPath: string,
    _data: ReportDocument
  ): boolean {
    if (propertyPath === "content") {
      return true;
    }
    return undefined;
  }
}
