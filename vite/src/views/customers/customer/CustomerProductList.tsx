import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { compareStatus, getBackendErr, navigateTo } from "@/utils/genUtils";
import { CusProduct, CusProductStatus } from "@autumn/shared";
import { useNavigate } from "react-router";
import { useCustomerContext } from "./CustomerContext";

import {
  DropdownMenuItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { Link } from "react-router";
import { getStripeSubLink } from "@/utils/linkUtils";
import React from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { ArrowUpRightFromSquare } from "lucide-react";
import { AdminHover } from "@/components/general/AdminHover";

export const CustomerProductList = ({
  customer,
  products,
}: {
  customer: any;
  products: any;
}) => {
  const navigate = useNavigate();
  const { env } = useCustomerContext();

  const sortedProducts = customer.products.sort((a: any, b: any) => {
    if (a.status !== b.status) {
      return compareStatus(a.status, b.status);
    }

    // return a.product.name.localeCompare(b.product.name);
    return b.created_at - a.created_at;
  });

  return (
    <div>
      <Table className="p-2">
        <TableHeader className="bg-transparent">
          <TableRow className="">
            <TableHead className="">Name</TableHead>
            <TableHead className="">Product ID</TableHead>
            <TableHead className="">Status</TableHead>
            <TableHead className="min-w-0 w-28">Created At</TableHead>

            <TableHead className="min-w-0 w-8"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedProducts.map((cusProduct: CusProduct) => {
            return (
              <TableRow
                key={cusProduct.id}
                className="cursor-pointer"
                onClick={() => {
                  navigateTo(
                    `/customers/${customer.id || customer.internal_id}/${
                      cusProduct.product_id
                    }?id=${cusProduct.id}`,
                    navigate,
                    env
                  );
                }}
              >
                <TableCell>
                  <AdminHover texts={[
                    {
                      key: "Cus Product ID",
                      value: cusProduct.id,
                    },
                    {
                      key: "Stripe Subscription ID (1)",
                      value: cusProduct.subscription_ids?.[0] || "N/A",
                    },
                  ]}>
                    {
                      products.find((p: any) => p.id === cusProduct.product_id)?.name
                    }
                  </AdminHover>
                </TableCell>
                <TableCell className="overflow-hidden text-ellipsis">
                  {cusProduct.product_id}
                </TableCell>
                <TableCell>
                  <div className="flex gap-0.5 items-center">
                    {cusProduct.status === "active" && (
                      <Badge variant="status" className="bg-lime-500 h-fit">
                        active
                      </Badge>
                    )}
                    {cusProduct.status === "expired" && (
                      <Badge variant="status" className="bg-stone-800 h-fit">
                        expired
                      </Badge>
                    )}
                    {cusProduct.status === "past_due" && (
                      <Badge variant="status" className="bg-red-500 h-fit">
                        past due
                      </Badge>
                    )}
                    {cusProduct.status === "scheduled" && (
                      <Badge variant="status" className="bg-blue-500 h-fit">
                        scheduled
                      </Badge>
                    )}
                    {cusProduct.subscription_ids &&
                      cusProduct.subscription_ids.length > 0 && (
                        <React.Fragment>
                          {cusProduct.subscription_ids.map((subId: string) => {
                            return (
                              <Link
                                key={subId}
                                to={getStripeSubLink(subId, env)}
                                target="_blank"
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                              >
                                <div className="flex justify-center items-center w-fit px-2 gap-2 h-6">
                                  <ArrowUpRightFromSquare
                                    size={12}
                                    className="text-[#665CFF]"
                                  />
                                </div>
                              </Link>
                            );
                          })}
                        </React.Fragment>
                      )}
                  </div>
                </TableCell>
                <TableCell>
                  <span>
                    {formatUnixToDateTime(cusProduct.created_at).date}
                  </span>{" "}
                  <span className="text-t3">
                    {formatUnixToDateTime(cusProduct.created_at).time}
                  </span>
                </TableCell>
                <TableCell className="flex items-center justify-center">
                  <EditCustomerProductToolbar cusProduct={cusProduct} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

const EditCustomerProductToolbar = ({
  cusProduct,
}: {
  cusProduct: CusProduct;
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <DropdownMenu open={dialogOpen} onOpenChange={setDialogOpen}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton className="!w-4 !h-6 !rounded-md" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-t2">
        {/* Update status */}
        {[CusProductStatus.Expired].map((status) => (
          <DropdownMenuItem
            key={status}
            className="p-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <UpdateStatusDropdownBtn cusProduct={cusProduct} status={status} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const UpdateStatusDropdownBtn = ({
  cusProduct,
  status,
}: {
  cusProduct: CusProduct;
  status: CusProductStatus;
}) => {
  const [loading, setLoading] = useState(false);
  const { env, cusMutate } = useCustomerContext();
  const axiosInstance = useAxiosInstance({ env });

  return (
    <Button
      variant="ghost"
      dim={5}
      size="sm"
      className="p-2 h-full w-full flex justify-between"
      // isLoading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await CusService.updateCusProductStatus(
            axiosInstance,
            cusProduct.id,
            {
              status,
            }
          );
          await cusMutate();
        } catch (error) {
          toast.error(getBackendErr(error, "Failed to update status"));
        }
        setLoading(false);
      }}
    >
      {keyToTitle(status)}
      {loading && <SmallSpinner />}
    </Button>
  );
};
