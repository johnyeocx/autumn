import { cn } from "@/lib/utils";

import { Button } from "../ui/button";

export const ToggleDisplayButton = ({ show, disabled, onClick, children }) => {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "text-t3 w-fit",
        show && "bg-zinc-200 text-t2 hover:bg-zinc-200"
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
};
