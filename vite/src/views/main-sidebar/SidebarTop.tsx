import { cn } from "@/lib/utils";
import {
  OrganizationSwitcher,
  useOrganization,
  useUser,
} from "@clerk/clerk-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

import { EnvDropdown } from "./EnvDropdown";

import { useEnv } from "@/utils/envUtils";
import { useSidebarContext } from "./SidebarContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { AdminHover } from "@/components/general/AdminHover";

export const SidebarTop = () => {
  const { isLoaded, user } = useUser();
  const { state, setState } = useSidebarContext();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress;
  const env = useEnv();
  const { organization } = useOrganization();
  const prevOrgIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip the first render
    if (prevOrgIdRef.current === null) {
      prevOrgIdRef.current = organization?.id || null;
      return;
    }

    // If organization changed (switched or created/deleted)
    if (prevOrgIdRef.current !== (organization?.id || null)) {
      console.log("Organization changed, refreshing page");
      window.location.reload();
    }

    // Update the ref
    prevOrgIdRef.current = organization?.id || null;
  }, [organization]);

  return (
    <div className="px-2">
      <div
        className={cn(
          "flex items-center w-full",
          state == "expanded" ? "justify-between" : "justify-center",
        )}
      >
        {state == "expanded" && (
          <div className="flex flex-col">
            <div className="flex relative w-full h-7">
              {organization && (
                <AdminHover
                  texts={[
                    {
                      key: "id",
                      value: organization.id,
                    },
                    {
                      key: "slug",
                      value: organization.slug || "N/A",
                    },
                  ]}
                >
                  <OrganizationSwitcher
                    appearance={{
                      elements: {
                        organizationSwitcherTrigger:
                          "flex !pl- pr-1 max-w-[160px]",
                      },
                    }}
                    hidePersonal={true}
                    skipInvitationScreen={true}
                    afterCreateOrganizationUrl="/sandbox/onboarding"
                  />
                </AdminHover>
              )}
            </div>
          </div>
        )}
        <Button
          size="sm"
          onClick={() => {
            setState((prev: string) =>
              prev == "expanded" ? "collapsed" : "expanded",
            );
          }}
          variant="ghost"
          className="p-0 w-5 h-5 text-t3 m-0"
        >
          {state == "expanded" ? (
            <ChevronLeft size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </Button>
      </div>
    </div>
  );
};

const CopyText = ({ text }: { text: string }) => {
  const [isHover, setIsHover] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <p
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
        className="flex items-center gap-1 font-mono hover:underline cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          navigator.clipboard.writeText(text);
          setIsCopied(true);
          setTimeout(() => {
            setIsCopied(false);
          }, 1000);
        }}
      >
        {text}
      </p>
      {(isCopied || isHover) && (
        <div
          onClick={() => {
            navigator.clipboard.writeText(text);
            setIsCopied(true);
          }}
        >
          {isCopied ? <Check size={10} /> : <Copy size={10} />}
        </div>
      )}
    </div>
  );
};
