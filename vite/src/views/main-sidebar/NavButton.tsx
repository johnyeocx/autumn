import { useTab } from "@/hooks/useTab";
import { cn } from "@/lib/utils";
import { getRedirectUrl } from "@/utils/genUtils";
import { AppEnv } from "@autumn/shared";
import { Link } from "react-router";
import { useState } from "react";
import { useSidebarContext } from "./SidebarContext";
import { useEnv } from "@/utils/envUtils";

export const NavButton = ({
  value,
  icon,
  title,
  env,
  className,
  href,
  online = false,
}: {
  value: string;
  icon: any;
  title: string;
  env?: AppEnv;
  className?: string;
  href?: string;
  online?: boolean;
}) => {
  // Get window path
  env = useEnv();
  const { state } = useSidebarContext();

  const tab = useTab();
  const isActive = tab == value;

  const [isHovered, setIsHovered] = useState(false);
  const showTooltip = state === "collapsed" && isHovered;

  return (
    <div className="relative">
      <Link
        to={href ? href : getRedirectUrl(`/${value}`, env)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          `cursor-pointer font-medium transition-all duration-100 
           text-sm flex h-9 items-center text-t2 hover:text-primary`,
          isActive && "font-semibold text-primary hover:text-primary/80",
          className,
        )}
        target={href ? "_blank" : undefined}
      >
        <div
          className={cn(
            "flex justify-center w-4 h-4 items-center rounded-sm transition-all duration-100",
            state == "expanded" && "mr-2",
            isHovered && "translate-x-[-1px]",
          )}
        >
          {icon}
        </div>
        <span
          className={cn(
            "transition-all duration-200 whitespace-nowrap",
            state === "expanded"
              ? "opacity-100 translate-x-0"
              : "opacity-0 -translate-x-2 pointer-events-none w-0 m-0 p-0",
          )}
        >
          {title}
        </span>
        {online && (
          <span className="relative flex h-2 w-2 ml-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
          </span>
        )}
      </Link>
      
      {/* Custom Tooltip */}
      {showTooltip && (
        <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 z-50">
          <div className="relative">
            {/* Arrow */}
            <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-full">
              <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-gray-900"></div>
            </div>
            {/* Tooltip content */}
            <div className="bg-gray-900 text-white px-2 py-1 rounded text-sm font-medium whitespace-nowrap">
              {title}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
