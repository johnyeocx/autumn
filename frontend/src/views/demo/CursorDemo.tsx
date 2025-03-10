"use client";

import axios from "axios";
import toast from "react-hot-toast";
import { useState, useEffect } from "react";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/ui/button";
import { AutumnProvider, PricingPage } from "@useautumn/react";
import { useDemoSWR } from "@/services/useAxiosSwr";
import CustomerBalances from "./CustomerBalances";
import { APIPlayground } from "./APIPlayground";
import Image from "next/image";
import { checkAccess, createAxiosInstance, sendUsage } from "./autumnBackend";
import { Input } from "@/components/ui/input";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { cn } from "@/lib/utils";
import { mutate } from "swr";

const endpoint = process.env.NEXT_PUBLIC_BACKEND_URL;
const customerId = "ayush";

// Custom search input component that matches the dark design
const DarkSearchInput = ({
  placeholder = "Plan, search, build anything...",
  onSearch,
}: {
  placeholder?: string;
  onSearch?: (query: string) => void;
}) => {
  const [query, setQuery] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSearch) {
      onSearch(query);
    }
  };

  return (
    <div className="w-full max-w-[500px] relative">
      <div className="w-full flex items-center gap-2 bg-zinc-900 rounded-md px-3 py-2 border border-zinc-800">
        <div className="flex items-center gap-1 text-zinc-400">
          <span className="inline-flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z"
                fill="currentColor"
              />
              <path
                d="M12 6C11.45 6 11 6.45 11 7V12C11 12.55 11.45 13 12 13C12.55 13 13 12.55 13 12V7C13 6.45 12.55 6 12 6Z"
                fill="currentColor"
              />
              <path
                d="M12 14C11.45 14 11 14.45 11 15V17C11 17.55 11.45 18 12 18C12.55 18 13 17.55 13 17V15C13 14.45 12.55 14 12 14Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="text-sm font-medium">Agent</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "w-full bg-transparent border-none outline-none text-zinc-300 placeholder:text-zinc-500",
            "text-base focus:outline-none focus:ring-0 px-2 text-sm"
          )}
        />
        <button
          className="bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm hover:bg-blue-700 transition-colors flex items-center gap-1"
          onClick={() => onSearch && onSearch(query)}
        >
          Send
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 20V4L22 12L3 20ZM5 17L16.85 12L5 7V10.5L11 12L5 13.5V17Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default function CursorDemo({
  publishableKey,
  secretKey,
  name,
  buttons,
}: {
  publishableKey: string;
  secretKey: string;
  name: string;
  buttons: any[];
}) {
  const axiosInstance = createAxiosInstance(secretKey, endpoint!);
  const [userId, setUserId] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [confirmedUserId, setConfirmedUserId] = useState("");
  const {
    data: customer,
    error,
    isLoading: customerLoading,
    mutate: cusMutate,
  } = useDemoSWR({
    url: `/public/customers/${customerId}?user_id=${confirmedUserId}`,
    publishableKey: publishableKey || "",
    endpoint: endpoint,
  });

  const [entitledReq, setEntitledReq] = useState({});
  const [eventsReq, setEventsReq] = useState({});
  const [hasAccessLoading, setHasAccessLoading] = useState(false);
  const [hasAccessResponse, setHasAccessResponse] = useState(null);
  const [sendEventLoading, setSendEventLoading] = useState(false);
  const [sendEventResponse, setSendEventResponse] = useState(null);
  const [getCustomerRequest] = useState({ customer_id: customerId });
  const [getCustomerResponse, setGetCustomerResponse] = useState(null);

  useEffect(() => {
    setGetCustomerResponse(customer?.entitlements);
  }, [customer]);

  const handleBtnClicked = async ({
    featureId,
    value,
  }: {
    featureId: string;
    value: number;
  }) => {
    if (value > 0) {
      setHasAccessLoading(true);
      setEntitledReq({
        customer_id: customerId,
        feature_id: featureId,
        user_id: userId,
      });
      const data = await checkAccess({
        axiosInstance,
        customerId,
        featureId,
        userId,
      });
      setHasAccessResponse(data);
      setHasAccessLoading(false);

      if (!data.allowed) {
        toast.error("You're out of " + featureId);
        return;
      }
    }

    setSendEventLoading(true);
    setEventsReq({
      customer_id: customerId,
      event_name: featureId,
      properties: {
        value,
        user_id: userId,
      },
    });
    const eventData = await sendUsage({
      axiosInstance,
      customerId,
      featureId,
      value,
      userId,
    });
    setSendEventResponse(eventData);
    setSendEventLoading(false);
    await cusMutate();
  };

  return (
    <AutumnProvider publishableKey={publishableKey || ""} endpoint={endpoint}>
      <div className="w-full h-screen flex justify-between">
        <div className="flex flex-col gap-4 w-full px-10 pt-4">
          <CustomToaster />
          <div className="flex gap-4 items-center">
            <div className="text-xl font-extrabold">{name}</div>
          </div>

          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="User ID"
              value={userId}
              className="max-w-[200px]"
              onChange={(e) => setUserId(e.target.value)}
            />
            <Button
              variant="gradientPrimary"
              onClick={async () => {
                setConfirmedUserId(userId);
                await cusMutate();
              }}
            >
              Login
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="gradientPrimary"
              className="w-fit"
              onClick={() =>
                handleBtnClicked({
                  featureId: "user",
                  value: 1,
                })
              }
            >
              Add User
            </Button>
            <Button
              variant="gradientPrimary"
              className="w-fit"
              onClick={() =>
                handleBtnClicked({
                  featureId: "user",
                  value: -1,
                })
              }
            >
              Remove User
            </Button>
            {/* {buttons.map((button, index) => (
              <ActionButton
                key={index}
                buttonData={button}
                handleClicked={() =>
                  handleBtnClicked({
                    featureId: button.feature_id,
                    value: button.value,
                  })
                }
              />
            ))} */}
          </div>

          {/* Dark search input component */}
          <div className="mt-6">
            <DarkSearchInput
              onSearch={(query) => {
                handleBtnClicked({
                  featureId: "fast-requests",
                  value: 1,
                });
              }}
            />
          </div>

          <div className="text-lg font-medium mt-4 -mb-3">Billing</div>
          <p className="text-sm text-t3">
            {customer?.name ? customer?.name : customerId}, you have access to:
          </p>
          <CustomerBalances customer={customer} />
          <div className="text-lg font-medium mt-2">Pricing</div>

          <div className="min-w-[600px]">
            <PricingPage customerId={customerId} />
          </div>

          <p className="text-xs text-t3">
            Make a test purchase to see how Autumn handles it. Use the Stripe
            test card <span className="font-bold">4242 4242 4242 4242</span>{" "}
            with any expiration date, CVC and cardholder details.
          </p>
        </div>
        <div className="space-y-4 flex flex-col bg-gray-900 p-4 h-full min-h-fit w-[400px]">
          <Image
            src="/demo-assets/autumn-logo.png"
            alt="Autumn Logo"
            width={100}
            height={100}
          />
          <APIPlayground
            title="Check Feature Access"
            endpoint="GET /entitled"
            request={entitledReq}
            response={hasAccessResponse}
            loading={hasAccessLoading}
          />
          <APIPlayground
            title="Send Usage Event"
            endpoint="POST /events"
            request={eventsReq}
            response={sendEventResponse}
            loading={sendEventLoading}
          />
          <APIPlayground
            title="Get Customer"
            endpoint="GET /customers/:customer_id"
            request={getCustomerRequest}
            response={getCustomerResponse}
            loading={customerLoading}
          />
        </div>
      </div>
    </AutumnProvider>
  );
}

export const ActionButton = ({
  buttonData,
  handleClicked,
}: {
  buttonData: any;
  handleClicked: () => void;
}) => {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      isLoading={loading}
      onClick={async () => {
        setLoading(true);
        await handleClicked();
        setLoading(false);
      }}
      variant="gradientPrimary"
    >
      {buttonData.display_name}
    </Button>
  );
};
