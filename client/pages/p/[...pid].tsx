import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { GetStaticPaths, GetStaticProps } from "next";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import getIconSvgData from "../../lib/getIconSvgData";
import getLocalizationConfigParameters from "../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../lib/getTagConfigParameters";
import { initAdminApp } from "../../lib/initAdminApp";
import {
  capitalize,
  ConfigContext,
  ConfigParameters,
} from "../../modules/impower-config";
import ConfigCache from "../../modules/impower-config/classes/configCache";
import format from "../../modules/impower-config/utils/format";
import {
  confirmDialogClose,
  ConfirmDialogContext,
} from "../../modules/impower-confirm-dialog";
import {
  ContributionDocument,
  getSerializableDocument,
  ProjectDocument,
} from "../../modules/impower-data-store";
import DataStoreCache from "../../modules/impower-data-store/classes/dataStoreCache";
import { useDialogNavigation } from "../../modules/impower-dialog";
import HistoryState from "../../modules/impower-dialog/classes/historyState";
import {
  IconLibraryContext,
  iconLibraryRegister,
  SvgData,
} from "../../modules/impower-icon";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../../modules/impower-navigation";
import navigationSetTransitioning from "../../modules/impower-navigation/utils/navigationSetTransitioning";
import { PageHead, ShareArticleHead } from "../../modules/impower-route";
import PitchCard from "../../modules/impower-route-pitch/components/PitchCard";
import PitchCardLayout from "../../modules/impower-route-pitch/components/PitchCardLayout";
import PostFooter from "../../modules/impower-route-pitch/components/PostFooter";
import PostHeader from "../../modules/impower-route-pitch/components/PostHeader";
import PostLayout from "../../modules/impower-route-pitch/components/PostLayout";
import PageNotFound from "../../modules/impower-route/components/layouts/PageNotFound";
import useBodyBackgroundColor from "../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../modules/impower-route/hooks/useHTMLBackgroundColor";
import useThemeColor from "../../modules/impower-route/hooks/useThemeColor";
import { useRouter } from "../../modules/impower-router";
import { UserContext } from "../../modules/impower-user";

const LOAD_INITIAL_LIMIT = 5;

const DelistedPitchBanner = dynamic(
  () =>
    import("../../modules/impower-route-pitch/components/DelistedPitchBanner"),
  { ssr: false }
);

const EmptyPitchList = dynamic(
  () => import("../../modules/impower-route-pitch/components/EmptyPitchList"),
  {
    ssr: false,
  }
);

const StyledPage = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const StyledPageContent = styled.div`
  flex: 1;
  position: relative;
`;

const StyledAbsoluteContent = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
`;

interface PitchPostPageProps {
  pid: string;
  doc: ProjectDocument;
  contributionDocs: { [id: string]: ContributionDocument };
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
  ogImage: string;
}

const PitchPostPageContent = React.memo((props: PitchPostPageProps) => {
  const { pid, doc, contributionDocs, config, icons, ogImage } = props;

  const [navigationState, navigationDispatch] = useContext(NavigationContext);
  const transitioning = navigationState?.transitioning;
  const [configState] = useContext(ConfigContext);
  const [, iconLibraryDispatch] = useContext(IconLibraryContext);
  const [, confirmDialogDispatch] = useContext(ConfirmDialogContext);
  const [userState] = useContext(UserContext);
  const { my_recent_pitched_projects } = userState;

  // Use user's recent submission if it exists, otherwise use doc from server.
  // This allows us to display a user's submission instantly
  // (even before it is finished uploading to the server)
  const recentSubmission = my_recent_pitched_projects?.[pid];
  const validDoc = recentSubmission || doc;

  const [scrollParent, setScrollParent] = useState<HTMLDivElement>();
  const [titleEl, setTitleEl] = useState<HTMLDivElement>();
  const [titleHeight, setTitleHeight] = useState<number>();
  const [pitchDoc, setPitchDoc] = useState(validDoc || undefined);
  const [viewingArchvied, setViewingArchived] = useState(false);
  const pitchDocRef = useRef(validDoc || undefined);

  const name = pitchDoc?.name;
  const author = pitchDoc?._author;
  const tags = pitchDoc?.tags;
  const pitchedAt = pitchDoc?.pitchedAt;
  const projectType = pitchDoc?.projectType;

  const section = `${capitalize(projectType)} Pitch`;

  const pitchedAtISO =
    typeof pitchedAt === "string" ? pitchedAt : pitchedAt?.toDate()?.toJSON();

  const theme = useTheme();

  const router = useRouter();
  const routerIsReady = router.isReady;

  ConfigCache.instance.set(config);
  iconLibraryDispatch(iconLibraryRegister("solid", icons));

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);
  useThemeColor(theme.palette.primary.main);

  useEffect(() => {
    if (validDoc) {
      pitchDocRef.current = validDoc;
      setPitchDoc(validDoc);
    } else {
      const loadPitchDoc = async (): Promise<void> => {
        try {
          const DataStoreRead = (
            await import(
              "../../modules/impower-data-store/classes/dataStoreRead"
            )
          ).default;
          const pitchedSnap = await new DataStoreRead(
            "pitched_projects",
            pid
          ).get();
          const pitched_doc = pitchedSnap.data() as ProjectDocument;
          if (pitched_doc) {
            pitchDocRef.current = pitched_doc;
            setPitchDoc(pitchDocRef.current);
          } else {
            const snap = await new DataStoreRead("projects", pid).get();
            const doc = snap.data() as ProjectDocument;
            if (doc) {
              pitchDocRef.current = doc;
              setPitchDoc(pitchDocRef.current);
            } else {
              pitchDocRef.current = null;
              setPitchDoc(pitchDocRef.current);
            }
          }
        } catch {
          pitchDocRef.current = null;
          setPitchDoc(pitchDocRef.current);
        }
      };
      loadPitchDoc();
    }
  }, [pid, validDoc]);

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("none"));
    navigationDispatch(navigationSetText(undefined, "Pitch"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  useEffect(() => {
    if (routerIsReady) {
      navigationDispatch(navigationSetTransitioning(false));
    }
  }, [navigationDispatch, routerIsReady]);

  const url = useMemo(() => `/p/${pid}`, [pid]);

  const handleKudo = useCallback(
    (
      e: React.MouseEvent,
      kudoed: boolean,
      pitchId: string,
      contributionId: string
    ): void => {
      if (pitchId === pid && !contributionId) {
        const kudos = kudoed
          ? (pitchDocRef.current.kudos || 0) + 1
          : (pitchDocRef.current.kudos || 0) - 1;
        const currentDoc = pitchDocRef.current;
        const newDoc = { ...currentDoc, kudos };
        pitchDocRef.current = newDoc;
        DataStoreCache.instance.override(pitchId, { kudos });
        setPitchDoc({ ...pitchDocRef.current });
      }
    },
    [pid]
  );

  const handleCreateContribution = useCallback(
    (e: React.MouseEvent<Element, MouseEvent>, pitchId: string): void => {
      if (!recentSubmission) {
        const contributions = (pitchDocRef.current.contributions || 0) + 1;
        const currentDoc = pitchDocRef.current;
        const newDoc = { ...currentDoc, contributions };
        pitchDocRef.current = newDoc;
        DataStoreCache.instance.override(pitchId, { contributions });
        setPitchDoc({ ...pitchDocRef.current });
      }
    },
    [recentSubmission]
  );

  const handleDeleteContribution = useCallback(
    async (
      e: React.MouseEvent<Element, MouseEvent>,
      pitchId: string
    ): Promise<void> => {
      if (!recentSubmission) {
        const contributions = (pitchDocRef.current.contributions || 0) - 1;
        const currentDoc = pitchDocRef.current;
        const newDoc = { ...currentDoc, contributions };
        pitchDocRef.current = newDoc;
        DataStoreCache.instance.override(pitchId, { contributions });
        setPitchDoc({ ...pitchDocRef.current });
        confirmDialogDispatch(confirmDialogClose());
      }
    },
    [confirmDialogDispatch, recentSubmission]
  );

  const handleChangeScore = useCallback(
    (e: React.MouseEvent, score: number): void => {
      pitchDocRef.current.score = score || 0;
      DataStoreCache.instance.override(pid, { score });
      setPitchDoc({ ...pitchDocRef.current });
    },
    [pid]
  );

  const [, closeAppDialog] = useDialogNavigation("a");

  const handleDeletePitch = useCallback(async (): Promise<void> => {
    if (pitchDocRef.current) {
      pitchDocRef.current = {
        ...pitchDocRef.current,
        pitched: false,
        delisted: true,
        name: "[deleted]",
        summary: "[deleted]",
        _author: { u: "[deleted]", i: null, h: "#FFFFFF" },
      };
    }
    setPitchDoc(pitchDocRef.current);
    confirmDialogDispatch(confirmDialogClose());
    closeAppDialog();
  }, [confirmDialogDispatch, closeAppDialog]);

  const handleBack = useCallback(async () => {
    const router = (await import("next/router")).default;
    if (HistoryState.instance.prev) {
      router.back();
    } else {
      router.replace("/pitch");
    }
  }, []);

  const handleViewArchived = useCallback(async (value: ProjectDocument) => {
    setPitchDoc(value);
    setViewingArchived(true);
  }, []);

  const postStyle: React.CSSProperties = useMemo(
    () => ({
      backgroundColor: "white",
      boxShadow: theme.shadows[1],
      overflowX: "hidden",
      overflowY: "scroll",
      overscrollBehavior: "contain",
      maxHeight: "100%",
      borderRadius: 0,
    }),
    [theme.shadows]
  );

  const cardStyle: React.CSSProperties = useMemo(
    () => ({
      borderRadius: 0,
    }),
    []
  );
  const openedActionsStyle: React.CSSProperties = useMemo(
    () => ({
      display: "flex",
      visibility: "visible",
    }),
    []
  );
  const closedActionsStyle: React.CSSProperties = useMemo(
    () => ({
      display: "none",
    }),
    []
  );

  const scrollbarSpacerStyle: React.CSSProperties = useMemo(
    () => ({
      display: "none",
    }),
    []
  );

  const dividerStyle: React.CSSProperties = useMemo(
    () => ({ opacity: "1" }),
    []
  );

  const footerStyle: React.CSSProperties = useMemo(
    () => ({ display: "flex" }),
    []
  );

  const delisted = doc?.delisted;

  const handlePostLayoutRef = useCallback((instance: HTMLDivElement): void => {
    if (instance) {
      setScrollParent(instance);
    }
  }, []);

  const handleTitleRef = useCallback((instance: HTMLDivElement) => {
    if (instance) {
      setTitleEl(instance);
    }
  }, []);

  useEffect(() => {
    if (!titleEl) {
      return (): void => null;
    }
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (entry.target === titleEl) {
        const { height } = entry.contentRect;
        if (height > 0) {
          setTitleHeight(height);
        }
      }
    });
    resizeObserver.observe(titleEl);
    return (): void => {
      resizeObserver.disconnect();
    };
  }, [titleEl]);

  if (transitioning) {
    return <EmptyPitchList loading loadingMessage={`Loading...`} />;
  }

  if (pitchDoc === undefined) {
    return (
      <>
        <PostLayout style={postStyle}>
          <PostHeader
            label={`Impower Pitch`}
            elevation={2}
            onBack={handleBack}
          />
          <PitchCardLayout config={config} icons={icons} />
          <PostFooter dividerStyle={dividerStyle} />
        </PostLayout>
      </>
    );
  }

  if (!pitchDoc) {
    return <PageNotFound />;
  }

  return (
    <StyledPage>
      <ShareArticleHead
        author={author?.u}
        publishedTime={pitchedAtISO}
        modifiedTime={pitchedAtISO}
        section={section}
        tags={tags}
        title={name}
        description={`${format(
          (configState || config).messages[
            `pitched_${projectType || "game"}_author_preamble`
          ],
          {
            tag: pitchDoc?.tags?.[0] || "",
          }
        )} @${author?.u}`}
        url={url}
        image={ogImage || undefined}
      />
      <StyledPageContent>
        <StyledAbsoluteContent>
          <PostLayout ref={handlePostLayoutRef} style={postStyle}>
            <PostHeader
              label={`Impower Pitch`}
              title={doc?.name}
              elevation={2}
              titleHeight={titleHeight}
              delisted={delisted}
              onBack={handleBack}
            />
            {delisted && (
              <DelistedPitchBanner
                id={pid}
                archived={viewingArchvied}
                removed={pitchDoc?.removed}
                onChange={handleViewArchived}
              />
            )}
            <PitchCard
              config={config}
              icons={icons}
              id={pid}
              doc={pitchDoc}
              style={cardStyle}
              openedActionsStyle={openedActionsStyle}
              closedActionsStyle={closedActionsStyle}
              scrollbarSpacerStyle={scrollbarSpacerStyle}
              titleRef={handleTitleRef}
              onChangeScore={handleChangeScore}
              onDelete={handleDeletePitch}
            />
            <PostFooter
              scrollParent={scrollParent}
              pitchId={pid}
              doc={pitchDoc}
              kudoCount={pitchDoc?.kudos}
              contributionCount={pitchDoc?.contributions}
              contributionDocs={contributionDocs}
              dividerStyle={dividerStyle}
              style={footerStyle}
              onKudo={handleKudo}
              onCreateContribution={handleCreateContribution}
              onDeleteContribution={handleDeleteContribution}
            />
          </PostLayout>
        </StyledAbsoluteContent>
      </StyledPageContent>
    </StyledPage>
  );
});

const PitchPostPage = React.memo((props: PitchPostPageProps) => {
  return (
    <>
      <PageHead title={`Impower Pitch`} />
      <PitchPostPageContent {...props} />
    </>
  );
});

export default PitchPostPage;

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [],
    fallback: "blocking",
  };
};

export const getStaticProps: GetStaticProps = async (context) => {
  const { pid } = context.params;
  const docId = Array.isArray(pid) ? pid[0] : pid;
  const adminApp = await initAdminApp();
  const pitchSnapshot = await adminApp
    .firestore()
    .doc(`pitched_projects/${docId}`)
    .get();
  let pitchDoc = null;
  if (pitchSnapshot) {
    pitchDoc = getSerializableDocument<ProjectDocument>(pitchSnapshot.data());
  }
  const contributionsSnapshot = await adminApp
    .firestore()
    .collection(`pitched_projects/${docId}/contributions`)
    .where("nsfw", "==", false)
    .where("delisted", "==", false)
    .orderBy("rating", "desc")
    .limit(LOAD_INITIAL_LIMIT)
    .get();
  const contributionDocs: { [id: string]: ContributionDocument } = {};
  contributionsSnapshot.docs.forEach((s) => {
    const pitchId = s.ref.parent.parent.id;
    const contributionId = s.id;
    contributionDocs[`${pitchId}/${contributionId}`] =
      getSerializableDocument<ContributionDocument>(s.data());
  });
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };

  const icons = {};
  let ogImage = null;

  if (pitchDoc) {
    const mainTag = pitchDoc?.tags?.[0] || "";
    const iconName = config?.tagIconNames?.[mainTag] || "hashtag";
    if (iconName) {
      const component = (
        await import(`../../resources/icons/solid/${iconName}.svg`)
      ).default;
      const svgData = getIconSvgData(component);
      if (svgData) {
        icons[iconName] = svgData;
      }
    }
    ogImage = pitchDoc?.og;
    if (!ogImage) {
      const storage = adminApp.storage();
      const bucket = storage.bucket();
      const ogFilePath = `public/og/p/${pid}`;
      const ogFile = bucket.file(ogFilePath);
      ogImage = ogFile.publicUrl();
    }
  }

  // Regenerate the page:
  // - When a request comes in
  // - At most once every 60 seconds
  return {
    props: {
      pid: docId,
      doc: pitchDoc,
      contributionDocs,
      config,
      icons,
      ogImage,
    },
    revalidate: 60,
  };
};
