"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { toast } from "sonner";
import {
  useOrganization,
  useOrganizationList,
  useUser,
} from "@clerk/clerk-react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import Step from "@/components/general/OnboardingStep";
import ConnectStripe from "./ConnectStripe";
import { FeaturesTable } from "../features/FeaturesTable";
import { AppEnv, Feature } from "@autumn/shared";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { FeaturesContext } from "../features/FeaturesContext";
import SmallSpinner from "@/components/general/SmallSpinner";
import ConfettiExplosion from "react-confetti-explosion";
import { CreateFeature } from "../features/CreateFeature";
import { ProductsContext } from "../products/ProductsContext";
import { ProductsTable } from "../products/ProductsTable";
import CreateProduct from "../products/CreateProduct";
import CreateAPIKey from "../developer/CreateAPIKey";
import { DevContext } from "../developer/DevContext";
import { CodeDisplay } from "@/components/general/CodeDisplay";

import {
  faBuilding,
  faExternalLinkAlt,
} from "@fortawesome/pro-duotone-svg-icons";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CopyPublishableKey } from "../developer/DevView";
import { useEnv } from "@/utils/envUtils";
import {
  ArrowUpRight,
  ArrowUpRightFromSquare,
  Book,
  Building,
} from "lucide-react";
import { CreateOrgStep } from "./onboarding-steps/01_CreateOrg";
import { ConnectStripeStep } from "./onboarding-steps/02_ConnectStripe";
import { CreateProductStep } from "./onboarding-steps/03_CreateProduct";
import { CreateSecretKey } from "./onboarding-steps/04_CreateSecretKey";
import AttachProduct from "./onboarding-steps/04_AttachProduct";
import CheckAccessStep from "./onboarding-steps/05_CheckAccess";

function OnboardingView() {
  const env = useEnv();

  const { organization: org } = useOrganization();
  const [searchParams] = useSearchParams();
  const [orgCreated, setOrgCreated] = useState(org ? true : false);

  let [apiKey, setApiKey] = useState("");
  let [productId, setProductId] = useState("");
  const hasHandledOrg = useRef(false);

  const axiosInstance = useAxiosInstance({ env });

  const {
    data: productData,
    mutate: productMutate,
    isLoading: productLoading,
  } = useAxiosSWR({
    url: `/products/data`,
    env: env,
    withAuth: true,
  });

  const pollForOrg = async () => {
    for (let i = 0; i < 10; i++) {
      console.log("polling for org, attempt", i);
      const requiredProdLength = env == AppEnv.Sandbox ? 2 : 0;
      try {
        const response = await axiosInstance.get("/products/data");
        const pollingData = response.data;

        if (pollingData?.products.length != requiredProdLength) {
          throw new Error("Products not created");
        }
        setOrgCreated(true);
        await productMutate();
        return;
      } catch (error) {
        console.log("error", error);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    window.location.reload();
  };

  useEffect(() => {
    const toastMessage = searchParams.get("toast");
    if (toastMessage) {
      toast.error(toastMessage);
    }
  }, [searchParams]);

  useEffect(() => {
    if (org && !orgCreated && !hasHandledOrg.current) {
      // console.log("Gonna poll for org!");
      hasHandledOrg.current = true;
      pollForOrg();
    }
  }, [org, orgCreated]);

  return (
    <div className="text-sm w-full flex justify-start">
      <div className="flex flex-col p-8 px-14">
        <CreateOrgStep pollForOrg={pollForOrg} number={1} />
        {orgCreated && (
          <>
            <CreateProductStep
              productId={productId}
              setProductId={setProductId}
              number={2}
            />

            <CreateSecretKey apiKey={apiKey} setApiKey={setApiKey} number={3} />
            <ConnectStripeStep
              mutate={productMutate}
              productData={productData}
              number={4}
            />

            <AttachProduct productId={productId} apiKey={apiKey} number={5} />

            <CheckAccessStep apiKey={apiKey} number={6} />

            <Step
              title="Done!"
              number={7}
              description={
                <p>
                  You&apos;re all set! Autumn is tracking your customers' usage,
                  what they have access to and how much they should be billed.{" "}
                  <br /> <br /> Go to the Customers tab to manage your users,
                  and read our{" "}
                  <a
                    className="text-primary underline font-semibold break-none"
                    href="https://docs.useautumn.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Documentation
                    <Book size={12} className="inline ml-1" />
                  </a>{" "}
                  to learn more about what you can do with Autumn.
                </p>
              }
            >
              <div></div>
            </Step>
          </>
        )}
      </div>
    </div>
  );
}

export default OnboardingView;
