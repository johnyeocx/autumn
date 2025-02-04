"use client";

import { SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { Avatar, cn } from "@nextui-org/react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { AppEnv } from "@autumn/shared";
import { OrganizationProfile, OrganizationSwitcher, useOrganization, useUser } from "@clerk/nextjs";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SmallSpinner from "@/components/general/SmallSpinner";

export function SidebarTop({ orgName, env }: { orgName: string; env: AppEnv }) {
  const { state, toggleSidebar } = useSidebar();
  const { organization, isLoaded } = useOrganization();
  const { user } = useUser();
  const router = useRouter();
  const [curOrgId, setCurOrgId] = useState<string | null>(null);
  const [hidePlaceholder, setHidePlaceholder] = useState(false);

  useEffect(() => {
    if (organization) {
      setCurOrgId(organization.id);
    }

    if (curOrgId !== null && organization?.id !== curOrgId) {
      window.location.href = "/sandbox/customers";
      router.refresh();
    }
  }, [organization, curOrgId, router]);

  useEffect(() => {
    if (organization && isLoaded) {
      setTimeout(() => {
        setHidePlaceholder(true);
      }, 1000);
    }
  }, [organization, isLoaded]);

  return (
    <SidebarHeader className="px-3 pt-4 mb-2 w-full">
      <div
        className={cn(
          "flex items-center w-full",
          state == "expanded" ? "justify-between" : "justify-center"
        )}
      >
        {state == "expanded" && (
          <div className="flex flex-col">
            <div className="flex relative w-full h-7">
              {!hidePlaceholder && (
                <div className="flex items-center gap-2 text-sm font-medium h-7 absolute left-0 top-0 w-fit">
                  <Avatar
                    size="sm"
                    className="w-5 h-5 mr-1"
                    fallback={orgName[0]}
                    radius="md"
                  />
                  {!isLoaded && <SmallSpinner />}
                </div>
              )}
              {isLoaded && (
                <OrganizationSwitcher
                  appearance={{
                    elements: {
                      organizationSwitcherTrigger: "pl-0 pr-1 max-w-[160px]",
                    },
                  }}
                  hidePersonal={true}
                  skipInvitationScreen={true}
                  afterSwitchOrganizationUrl="/sandbox/customers"
                  afterCreateOrganizationUrl="/sandbox/customers"
                  // afterSelectOrganizationUrl="/sandbox/customer"
                  // onOrganizationChange={(organization) => {
                  //   console.log(organization);
                  //   router.refresh();
                  // }}
                />
              )}
            </div>
              {isLoaded && (
                user?.primaryEmailAddress?.emailAddress === 'johnyeocx@gmail.com' ||
                user?.primaryEmailAddress?.emailAddress === 'ayush@recaseai.com'
              ) && (
                <div className="text-xs text-gray-500 ml-2 flex items-center gap-1">
                  <span className="w-[70px] overflow-hidden text-ellipsis whitespace-nowrap">{organization?.id}</span>
                  <Button
                    onClick={() => navigator.clipboard.writeText(organization?.id || '')}
                    variant="ghost"
                    size="sm"
                    className="p-0 h-4 w-4"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              )}
          </div>
        )}

        <Button
          size="sm"
          onClick={toggleSidebar}
          variant="ghost"
          className="p-0 w-5 h-5 text-t3 m-0"
        >
          {state == "expanded" ? <ChevronLeft /> : <ChevronRight />}
        </Button>
      </div>
    </SidebarHeader>
  );
}
