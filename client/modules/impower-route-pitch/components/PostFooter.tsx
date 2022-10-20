import styled from "@emotion/styled";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AggData } from "../../impower-data-state";
import {
  ContributionDocument,
  isProjectDocument,
  ProjectDocument,
} from "../../impower-data-store";
import { Tabs } from "../../impower-route";
import PitchContributionList from "./PitchContributionList";
import PitchPostTab from "./PitchPostTab";

const StyledLoadingArea = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 200px;
  position: relative;
  z-index: 1;
  justify-content: center;
  align-items: center;
`;

const StyledCircularProgress = styled(CircularProgress)`
  min-width: ${(props): string => props.theme.spacing(4)};
  min-height: ${(props): string => props.theme.spacing(4)};
`;

type Mode = "kudo" | "contribute";

const tabLabels: { [type in Mode]: string } = {
  kudo: "{count:Kudo|Kudos}",
  contribute: "{count:Contribution|Contributions}",
};

const KudoList = dynamic(() => import("./KudoList"), {
  ssr: false,
  loading: () => (
    <StyledLoadingArea>
      <StyledCircularProgress color="secondary" />
    </StyledLoadingArea>
  ),
});

const StyledFooter = styled.div`
  flex: 1;
  flex-direction: column;
  display: none;
`;

const StyledFooterContent = styled.div`
  flex: 1;
  flex-direction: column;
  display: flex;
  position: relative;
`;

const StyledFooterTabsArea = styled.div`
  height: 48px;
  position: relative;
`;

const StyledFooterTabsContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: fit-content;
`;

const StyledDivider = styled(Divider)``;

const StyledRelativeArea = styled.div`
  position: relative;
`;

const StyledTabs = styled(Tabs)``;

interface PitchPostFooterTabsProps {
  tabs?: Mode[];
  tabLabels?: { [type in Mode]: string };
  tabCounts?: { [type in Mode]: number };
  value?: number;
  onChange?: (e: React.ChangeEvent, value: number) => void;
}

const PitchPostFooterTabs = React.memo(
  (props: PitchPostFooterTabsProps): JSX.Element => {
    const { tabs, tabLabels, tabCounts, value, onChange } = props;

    return (
      <StyledTabs value={value} onChange={onChange}>
        {tabs.map((tab, index) => (
          <PitchPostTab
            key={tab}
            tab={tab}
            selected={value === index}
            label={tabLabels[tab]}
            count={tabCounts[tab]}
          />
        ))}
      </StyledTabs>
    );
  }
);

interface PostFooterProps {
  scrollParent?: HTMLElement;
  footerRef?: React.Ref<HTMLDivElement>;
  kudoToolbarRef?: React.Ref<HTMLDivElement>;
  contributionToolbarRef?: React.Ref<HTMLDivElement>;
  pitchId?: string;
  contributionId?: string;
  doc?: ProjectDocument | ContributionDocument;
  kudoCount?: number;
  contributionCount?: number;
  contributionDocs?: { [id: string]: ContributionDocument };
  mountList?: boolean;
  mode?: "kudo" | "contribute";
  toolbarAreaStyle?: React.CSSProperties;
  toolbarStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  dividerStyle?: React.CSSProperties;
  onKudo?: (
    e: React.MouseEvent | React.ChangeEvent,
    kudoed: boolean,
    pitchId: string,
    contributionId: string,
    data: AggData
  ) => void;
  onCreateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onUpdateContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string,
    doc: ContributionDocument
  ) => void;
  onDeleteContribution?: (
    e: React.MouseEvent,
    pitchId: string,
    contributionId: string
  ) => void;
}

const PostFooter = React.memo((props: PostFooterProps): JSX.Element => {
  const {
    scrollParent,
    footerRef,
    kudoToolbarRef,
    contributionToolbarRef,
    pitchId,
    contributionId,
    doc,
    kudoCount,
    contributionCount,
    contributionDocs,
    mountList = true,
    mode,
    toolbarAreaStyle,
    toolbarStyle,
    dividerStyle,
    style,
    onKudo,
    onCreateContribution,
    onUpdateContribution,
    onDeleteContribution,
  } = props;

  const tabs = useMemo(() => {
    const result = [];
    if (onKudo) {
      result.push("kudo");
    }
    if (onCreateContribution) {
      result.push("contribute");
    }
    return result;
  }, [onKudo, onCreateContribution]);

  const initialTabIndex = tabs.indexOf(mode);

  const [tabIndex, setTabIndex] = useState(
    initialTabIndex >= 0 ? initialTabIndex : tabs.length - 1
  );

  const tabCounts = useMemo(() => {
    const result: { [type in Mode]: number } = { kudo: 0, contribute: 0 };
    if (onKudo) {
      result.kudo = kudoCount;
    }
    if (onCreateContribution) {
      result.contribute = contributionCount;
    }
    return result;
  }, [onKudo, onCreateContribution, kudoCount, contributionCount]);

  useEffect(() => {
    const newTabIndex = tabs.indexOf(mode);
    setTabIndex(newTabIndex >= 0 ? newTabIndex : tabs.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleTabChange = useCallback((e: React.ChangeEvent, value: number) => {
    setTabIndex(value);
  }, []);

  const footerStyle = useMemo(
    () => ({ display: mountList ? "flex" : "none", ...style }),
    [mountList, style]
  );

  return (
    <StyledFooter ref={footerRef} style={footerStyle}>
      <StyledFooterContent>
        {tabs.length > 1 && (
          <StyledFooterTabsArea>
            <StyledFooterTabsContent>
              <StyledRelativeArea style={dividerStyle}>
                <StyledDivider absolute />
              </StyledRelativeArea>
              <PitchPostFooterTabs
                tabs={tabs}
                tabLabels={tabLabels}
                tabCounts={tabCounts}
                value={tabIndex}
                onChange={handleTabChange}
              />
              <StyledRelativeArea>
                <StyledDivider absolute />
              </StyledRelativeArea>
            </StyledFooterTabsContent>
          </StyledFooterTabsArea>
        )}
        {mountList && tabIndex >= 0 && tabs.indexOf("kudo") === tabIndex && (
          <KudoList
            scrollParent={scrollParent}
            pitchId={pitchId}
            contributionId={contributionId}
            targetDoc={doc}
            kudoCount={kudoCount}
            toolbarRef={kudoToolbarRef}
            toolbarAreaStyle={toolbarAreaStyle}
            toolbarStyle={toolbarStyle}
            onKudo={onKudo}
          />
        )}
        {mountList &&
          tabIndex >= 0 &&
          tabs.indexOf("contribute") === tabIndex &&
          isProjectDocument(doc) && (
            <PitchContributionList
              scrollParent={scrollParent}
              pitchId={pitchId}
              pitchDoc={doc}
              contributionDocs={contributionDocs}
              toolbarRef={contributionToolbarRef}
              toolbarAreaStyle={toolbarAreaStyle}
              toolbarStyle={toolbarStyle}
              onCreateContribution={onCreateContribution}
              onUpdateContribution={onUpdateContribution}
              onDeleteContribution={onDeleteContribution}
            />
          )}
      </StyledFooterContent>
    </StyledFooter>
  );
});

export default PostFooter;
