import SidebarBottom from "./SidebarBottom";
import { NavButton } from "./NavButton";
import { useEnv } from "@/utils/envUtils";
import { cn } from "@/lib/utils";
import { useSidebarContext } from "./SidebarContext";
import { useHotkeys } from "react-hotkeys-hook";
import { Code, Package, Shield, User } from "lucide-react";
import { EnvDropdown } from "./EnvDropdown";
import { OrgDropdown } from "./components/OrgDropdown";
import { AdminOnly } from "../admin/components/AdminOnly";

export const MainSidebar = () => {
  const env = useEnv();
  const { state, setState } = useSidebarContext();

  useHotkeys(["meta+b", "ctrl+b"], () => {
    setState((prev: "expanded" | "collapsed") => (prev == "expanded" ? "collapsed" : "expanded"));
  });

  return (
    <div
      className={cn(
        `h-full bg-stone-100 py-4 flex flex-col justify-between transition-all duration-150`,
        state == "expanded"
          ? "min-w-[200px] max-w-[200px]"
          : "min-w-[50px] max-w-[50px]",
      )}
    >
      <div className="flex flex-col gap-6">
        <OrgDropdown />
        {/* <SidebarTop /> */}
        <EnvDropdown env={env} />
        <div className="flex flex-col px-4">
          <NavButton
            value="products"
            icon={<Package size={14} />}
            title="Products"
            env={env}
          />
          <NavButton
            value="customers"
            icon={<User size={20} />}
            title="Customers"
            env={env}
          />
          <NavButton
            value="dev"
            icon={<Code size={15} />}
            title="Developer"
            env={env}
          />
        </div>
      </div>
      {/* Sidebar bottom */}
      <SidebarBottom />
    </div>
  );
};
