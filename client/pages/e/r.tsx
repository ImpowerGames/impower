import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { GetStaticProps } from "next";
import dynamic from "next/dynamic";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import getLocalizationConfigParameters from "../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../lib/getTagConfigParameters";
import { ConfigParameters } from "../../modules/impower-config";
import ConfigCache from "../../modules/impower-config/classes/configCache";
import { StorageFile } from "../../modules/impower-core";
import { ResourceDocument } from "../../modules/impower-data-store";
import DataStoreCache from "../../modules/impower-data-store/classes/dataStoreCache";
import {
  NavigationContext,
  navigationSetBackgroundColor,
  navigationSetElevation,
  navigationSetLinks,
  navigationSetSearchbar,
  navigationSetText,
  navigationSetType,
} from "../../modules/impower-navigation";
import { Fallback } from "../../modules/impower-route";
import Footer from "../../modules/impower-route-home/components/elements/Footer";
import Illustration from "../../modules/impower-route-home/components/elements/Illustration";
import ResourceCreationFinishedSummary from "../../modules/impower-route/components/forms/ResourceCreationFinishedSummary";
import useBodyBackgroundColor from "../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../modules/impower-route/hooks/useHTMLBackgroundColor";
import { useRouter } from "../../modules/impower-router";
import { UserContext } from "../../modules/impower-user";
import IllustrationImage from "../../resources/illustrations/clip-working-from-home-2.svg";

const CreateResourceForm = dynamic(
  () =>
    import("../../modules/impower-route/components/forms/CreateResourceForm"),
  { loading: () => <Fallback color="primary" /> }
);

const StyledPage = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background-color: ${(props): string => props.theme.colors.lightForeground};

  ${(props): string => props.theme.breakpoints.down("md")} {
    background-color: white;
  }
`;

const StyledContent = styled.div`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: ${(props): string => props.theme.minHeight.navigationBar};
`;

const StyledBackgroundArea = styled.div`
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-end;
  overflow: hidden;

  ${(props): string => props.theme.breakpoints.down("md")} {
    display: none;
  }
`;

const StyledContainer = styled.div`
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
`;

interface CreateResourcePageProps {
  config: ConfigParameters;
}

const CreateResourcePage = React.memo((props: CreateResourcePageProps) => {
  const { config } = props;

  const [, navigationDispatch] = useContext(NavigationContext);

  const [userState] = useContext(UserContext);
  const { userDoc, uid, my_studio_memberships, studios } = userState;
  const [createDocId, setCreateDocId] = useState<string>();
  const [createDoc, setCreateDoc] = useState<ResourceDocument>();
  const router = useRouter();

  const theme = useTheme();

  ConfigCache.instance.set(config);

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);

  const username = userDoc?.username || "";
  const icon = userDoc?.icon?.fileUrl;
  const hex = userDoc?.hex;
  const recentlyAccessedStudioIds = useMemo(
    () =>
      my_studio_memberships === undefined
        ? undefined
        : my_studio_memberships === null
        ? null
        : Object.keys(my_studio_memberships),
    [my_studio_memberships]
  );
  const studio = recentlyAccessedStudioIds?.[0];
  const studioDoc = studios?.[studio || ""];
  const studioHandle = studioDoc?.handle || "";

  useEffect(() => {
    if (uid !== undefined) {
      const setup = async (): Promise<void> => {
        const createResourceDocument = (
          await import(
            "../../modules/impower-data-store/utils/createResourceDocument"
          )
        ).default;
        setCreateDoc(
          createResourceDocument({
            studio,
            _createdBy: uid,
            _author: {
              u: username,
              i: icon,
              h: hex,
            },
            name: "",
            slug: "",
            owners: [uid],
          })
        );
      };
      setup();
    }
  }, [router, studioHandle, studio, uid, username, icon, hex]);

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Resource"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  const handleSubmit = useCallback((e: React.MouseEvent, id: string) => {
    setCreateDocId(id);
  }, []);

  const handleUploadIcon = useCallback(
    (icon: StorageFile) => {
      setCreateDoc({ ...createDoc, icon });
    },
    [createDoc]
  );

  if (!process.env.NEXT_PUBLIC_ORIGIN?.includes("localhost")) {
    return null;
  }

  return (
    <>
      <StyledPage>
        <StyledBackgroundArea>
          <Illustration
            imageStyle={{
              position: "absolute",
              bottom: -64,
              right: -64,
              minWidth: "50%",
              minHeight: 550,
            }}
          >
            <IllustrationImage />
          </Illustration>
        </StyledBackgroundArea>
        <StyledContent>
          <StyledContainer>
            {createDoc ? (
              <CreateResourceForm
                docId={createDocId}
                doc={createDoc}
                onChange={setCreateDoc}
                onSubmit={handleSubmit}
                finishedSummary={
                  <ResourceCreationFinishedSummary
                    docId={createDocId}
                    doc={createDoc}
                    onUploadIcon={handleUploadIcon}
                  />
                }
              />
            ) : (
              <Fallback color="primary" />
            )}
          </StyledContainer>
        </StyledContent>
        <Footer />
      </StyledPage>
    </>
  );
});

export default CreateResourcePage;

export const getStaticProps: GetStaticProps<CreateResourcePageProps> =
  async () => {
    const config = {
      ...getLocalizationConfigParameters(),
      ...getTagConfigParameters(),
    };
    return {
      props: { config },
    };
  };
