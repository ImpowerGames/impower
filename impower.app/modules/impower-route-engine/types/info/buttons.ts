import React from "react";

export interface DataButtonInfo {
  refId: string;
  refTypeId: string;
  name: string;
  icon: React.ReactNode;
  summary: string;
  iconColor: string;
  textColor?: string;
  hasChildren: boolean;
}
