import SmallSpinner from "@/components/general/SmallSpinner";
import { faEllipsisVertical, faTrash } from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { Coupon } from "@autumn/shared";
import { getBackendErr } from "@/utils/genUtils";
import { useProductsContext } from "../ProductsContext";
import { CouponService } from "@/services/products/CouponService";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";

export const CouponRowToolbar = ({
  className,
  coupon,
}: {
  className?: string;
  coupon: Coupon;
}) => {
  const { env, mutate } = useProductsContext();
  const axiosInstance = useAxiosInstance({ env });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = async () => {
    setDeleteLoading(true);

    try {
      await CouponService.deleteCoupon({
        axiosInstance,
        internalId: coupon.internal_id,
      });
      await mutate();
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to delete coupon"));
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
              <FontAwesomeIcon icon={faTrash} size="sm" />
            )}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
