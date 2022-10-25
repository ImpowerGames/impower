import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import Paper from "@mui/material/Paper";
import { GetStaticProps } from "next";
import React, { useCallback, useContext, useEffect, useState } from "react";
import getLocalizationConfigParameters from "../../lib/getLocalizationConfigParameters";
import getTagConfigParameters from "../../lib/getTagConfigParameters";
import { ConfigParameters } from "../../modules/impower-config";
import ConfigCache from "../../modules/impower-config/classes/configCache";
import { StudioDocument } from "../../modules/impower-data-store";
import DataStoreCache from "../../modules/impower-data-store/classes/dataStoreCache";
import createStudioDocument from "../../modules/impower-data-store/utils/createStudioDocument";
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
import NavigationBarSpacer from "../../modules/impower-route/components/elements/NavigationBarSpacer";
import CreateStudioForm from "../../modules/impower-route/components/forms/CreateStudioForm";
import useBodyBackgroundColor from "../../modules/impower-route/hooks/useBodyBackgroundColor";
import useHTMLBackgroundColor from "../../modules/impower-route/hooks/useHTMLBackgroundColor";
import useHTMLOverscrollBehavior from "../../modules/impower-route/hooks/useHTMLOverscrollBehavior";
import { useRouter } from "../../modules/impower-router";
import { UserContext } from "../../modules/impower-user";
import IllustrationImage from "../../resources/illustrations/clip-busy-day-at-the-office.svg";

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

const StyledContainer = styled(Paper)`
  max-width: 100%;
  width: ${(props): string => props.theme.spacing(60)};
  margin: auto;
  overflow: hidden;
  ${(props): string => props.theme.breakpoints.down("md")} {
    border-radius: 0;
    box-shadow: none;
  }
`;

interface CreateStudioPageProps {
  config: ConfigParameters;
}

const CreateStudioPage = React.memo((props: CreateStudioPageProps) => {
  const { config } = props;

  const [, navigationDispatch] = useContext(NavigationContext);

  const [userState] = useContext(UserContext);
  const { userDoc, uid } = userState;
  const [createDocId, setCreateDocId] = useState<string>();
  const [createDoc, setCreateDoc] = useState<StudioDocument>();

  const theme = useTheme();

  ConfigCache.instance.set(config);

  useBodyBackgroundColor(theme.colors.lightForeground);
  useHTMLBackgroundColor(theme.colors.lightForeground);
  useHTMLOverscrollBehavior("auto");

  const username = userDoc?.username || "";
  const icon = userDoc?.icon?.fileUrl;
  const hex = userDoc?.hex;

  const router = useRouter();

  useEffect(() => {
    if (uid) {
      setCreateDoc(
        createStudioDocument({
          _createdBy: uid,
          _author: {
            u: username,
            i: icon,
            h: hex,
          },
          name: `${username}'s studio`,
          handle: "",
          owners: [uid],
        })
      );
    } else if (uid === null) {
      router.push(`/signup`);
    }
  }, [hex, icon, router, uid, username]);

  useEffect(() => {
    DataStoreCache.instance.clear();
  }, []);

  useEffect(() => {
    navigationDispatch(navigationSetType("page"));
    navigationDispatch(navigationSetText(undefined, "Studio"));
    navigationDispatch(navigationSetLinks());
    navigationDispatch(navigationSetSearchbar());
    navigationDispatch(navigationSetElevation());
    navigationDispatch(navigationSetBackgroundColor());
  }, [navigationDispatch]);

  const handleSubmit = useCallback(async (e: React.MouseEvent, id: string) => {
    setCreateDocId(id);
  }, []);

  if (process.env.NEXT_PUBLIC_ENVIRONMENT === "production") {
    return null;
  }

  return (
    <>
      <NavigationBarSpacer />
      <StyledPage>
        <StyledBackgroundArea>
          <Illustration
            imageStyle={{
              position: "absolute",
              bottom: -32,
              right: -96,
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
              <CreateStudioForm
                docId={createDocId}
                doc={createDoc}
                onChange={setCreateDoc}
                onSubmit={handleSubmit}
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

export default CreateStudioPage;

export const getStaticProps: GetStaticProps<
  CreateStudioPageProps
> = async () => {
  const config = {
    ...getLocalizationConfigParameters(),
    ...getTagConfigParameters(),
  };
  return {
    props: { config },
  };
};
