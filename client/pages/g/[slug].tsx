import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { GetStaticPaths, GetStaticProps } from "next";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Measure, { ContentRect } from "react-measure";
import { getAdminFirestore, initAdminApp } from "../../lib/admin";
import getIconSvgData from "../../lib/getIconSvgData";
import getLocalizationConfigParameters from "../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../lib/getTagConfigParameters";
import { ConfigParameters } from "../../modules/impower-config";
import ConfigCache from "../../modules/impower-config/classes/configCache";
import { overlayColorHex } from "../../modules/impower-core";
import {
  getSerializableDocument,
  ProjectDocument,
} from "../../modules/impower-data-store";
import DataStoreCache from "../../modules/impower-data-store/classes/dataStoreCache";
import {
  IconLibraryContext,
  iconLibraryRegister,
  SvgData,
} from "../../modules/impower-icon";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetType,
} from "../../modules/impower-navigation";
import {
  FadeAnimation,
  Fallback,
  ShareArticleHead,
  UnmountAnimation,
} from "../../modules/impower-route";
import Footer from "../../modules/impower-route-home/components/elements/Footer";
import PageFooter from "../../modules/impower-route-home/components/elements/PageFooter";
import PageNotFound from "../../modules/impower-route/components/layouts/PageNotFound";
import useBodyBackgroundColor from "../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../modules/impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../../modules/impower-route/hooks/useHTMLOverscrollBehavior";
import { Breakpoint } from "../../modules/impower-route/styles/breakpoint";
import { getBreakpoint } from "../../modules/impower-route/utils/getBreakpoint";
import { getPlaceholderUrl } from "../../modules/impower-storage";
import { UserContext } from "../../modules/impower-user";

const Page = dynamic(
  () => import("../../modules/impower-route/components/layouts/Page"),
  { loading: () => <Fallback /> }
);

const PlayerPreview = dynamic(
  () => import("../../modules/impower-route/components/elements/PlayerPreview"),
  { ssr: false }
);

const StyledGamePage = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const StyledMotionOverlay = styled(FadeAnimation)`
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
`;

interface GamePageProps {
  id: string;
  doc: ProjectDocument;
  config: ConfigParameters;
  icons: { [name: string]: SvgData };
}

const GamePage = React.memo((props: GamePageProps) => {
  const { id, doc, config, icons } = props;

  const [, navigationDispatch] = useContext(NavigationContext);
  const [, iconLibraryDispatch] = useContext(IconLibraryContext);

  const [userState] = useContext(UserContext);
  const { uid, submissions } = userState;
  // Use user's recent submission if it exists, otherwise use doc from server.
  // This allows us to display a user's submission instantly
  // (even before it is finished uploading to the server)
  const recentSubmission = submissions?.projects;
  const submissionPath = `projects/${id}`;
  const validDoc =
    recentSubmission?.path === submissionPath
      ? (recentSubmission as ProjectDocument)
      : doc;
  const [pageDoc] = useState(validDoc);
  const {
    slug,
    name,
    summary,
    _author: author,
    tags,
    publishedAt,
    republishedAt,
    preview,
    projectType,
  } = pageDoc;
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(Breakpoint.xs);

  const publishedAtISO =
    typeof publishedAt === "string"
      ? publishedAt
      : publishedAt?.toDate()?.toJSON();
  const republishedAtISO =
    typeof republishedAt === "string"
      ? republishedAt
      : republishedAt?.toDate()?.toJSON();

  const backgroundColor = pageDoc?.backgroundHex
    ? pageDoc?.backgroundHex
    : `#999999`;

  const navigationColor = pageDoc?.hex
    ? overlayColorHex("black", pageDoc?.hex, 0.55)
    : `#b3b3b3`;

  ConfigCache.instance.set(config);
  iconLibraryDispatch(iconLibraryRegister("solid", icons));

  useBodyBackgroundColor(backgroundColor);
  useHTMLBackgroundColor(backgroundColor);
  useHTMLOverscrollBehavior("auto");

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetElevation());
    if (navigationColor) {
      navigationDispatch(navigationSetBackgroundColor(navigationColor));
    }
  }, [navigationColor, navigationDispatch]);

  const handleResize = useCallback((contentRect: ContentRect): void => {
    if (contentRect.bounds) {
      setBreakpoint(getBreakpoint(contentRect.bounds.width));
    }
  }, []);

  const handleGetPlaceholderUrl = useCallback((fileUrl: string): string => {
    return getPlaceholderUrl(fileUrl);
  }, []);

  const url = useMemo(() => `/i/${slug}`, [slug]);

  const theme = useTheme();

  if (process.env.NEXT_PUBLIC_ENVIRONMENT === "production") {
    return null;
  }

  if (pageDoc === null) {
    return <PageNotFound />;
  }

  return (
    <>
      <ShareArticleHead
        author={author?.u}
        publishedTime={publishedAtISO}
        modifiedTime={republishedAtISO}
        section={projectType}
        tags={tags}
        title={name}
        description={summary}
        url={url}
        image={preview?.fileUrl}
      />
      <StyledGamePage style={{ backgroundColor }}>
        <Measure bounds onResize={handleResize}>
          {({ measureRef }): JSX.Element => (
            <>
              <Page
                innerRef={measureRef}
                docId={id}
                doc={pageDoc}
                uid={uid}
                breakpoint={breakpoint}
                getPlaceholderUrl={handleGetPlaceholderUrl}
              >
                <PlayerPreview doc={pageDoc} />
              </Page>
              <UnmountAnimation>
                {!pageDoc && (
                  <StyledMotionOverlay initial={1} animate={1} exit={0}>
                    <Page
                      docId={undefined}
                      doc={undefined}
                      uid={uid}
                      breakpoint={breakpoint}
                      getPlaceholderUrl={handleGetPlaceholderUrl}
                    >
                      <PlayerPreview doc={undefined} />
                    </Page>
                  </StyledMotionOverlay>
                )}
              </UnmountAnimation>
            </>
          )}
        </Measure>
        <Footer
          pageChildren={
            <PageFooter
              color={theme.palette.getContrastText(backgroundColor)}
            />
          }
        />
      </StyledGamePage>
    </>
  );
});

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: "blocking" };
};

export const getStaticProps: GetStaticProps = async (context) => {
  const { slug } = context.params;
  const docSlug = Array.isArray(slug) ? slug[0] : slug;
  // eslint-disable-next-line global-require
  const adminApp = await initAdminApp();
  const firestore = await getAdminFirestore(adminApp);
  const postsSnapshot = await firestore
    .collection(`slugs`)
    .where("slug", "==", docSlug)
    .limit(1)
    .get();
  const postDoc = postsSnapshot.docs[0]?.data();
  const serializableData = getSerializableDocument<ProjectDocument>(postDoc);
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  const mainTag = serializableData?.tags?.[0] || "";
  const validMainTag = config?.tagDisambiguations?.[mainTag]?.[0] || mainTag;
  const tagIconName = config?.tagIconNames?.[validMainTag] || "hashtag";
  const icons = {};
  const component = (
    await import(`../../resources/icons/solid/${tagIconName}.svg`)
  ).default;
  if (component) {
    const svgData = getIconSvgData(component);
    if (svgData) {
      icons[tagIconName] = svgData;
    }
  }
  // Revalidate every 60 seconds in case the published page was edited
  return {
    props: {
      id: docSlug,
      doc: serializableData,
      config,
      icons,
    },
    revalidate: 60,
  };
};

export default GamePage;
