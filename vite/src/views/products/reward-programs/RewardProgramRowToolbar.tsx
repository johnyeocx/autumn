import { useState } from "react";
import { useProductsContext } from "../ProductsContext";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { RewardProgram } from "@autumn/shared";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";
import SmallSpinner from "@/components/general/SmallSpinner";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { Delete } from "lucide-react";

export const RewardProgramRowToolbar = ({
  rewardProgram,
}: {
  rewardProgram: RewardProgram;
}) => {
  const { env, mutate } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);

    try {
      await axiosInstance.delete(`/v1/reward_programs/${rewardProgram.id}`);

      await mutate();
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to delete reward trigger"));
    }

    setDeleteLoading(false);
    setDeleteOpen(false);
  };
  return (
    <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-t2">
        <DropdownMenuItem
          className="flex items-center"
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await handleDelete();
          }}
        >
          <div className="flex items-center justify-between w-full gap-2">
            Delete
            {deleteLoading ? (
              <SmallSpinner />
            ) : (
              <Delete size={12} className="text-t3" />
            )}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
