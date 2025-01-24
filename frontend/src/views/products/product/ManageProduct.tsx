import { Breadcrumbs, BreadcrumbItem } from "@nextui-org/react";
import { useRouter } from "next/navigation";
import { EditProductToolbar } from "./EditProductToolbar";
import { ProductEntitlementTable } from "./entitlements/ProductEntitlementTable";
import { CreateEntitlement } from "./entitlements/CreateEntitlement";
import { ProductPricingTable } from "./prices/ProductPricingTable";
import { CreatePrice } from "./prices/CreatePrice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export const ManageProduct = ({
  product,
  customerData,
  customerProduct,
}: {
  product: any;
  customerData?: any;
  customerProduct?: any;
}) => {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium">{product.name}</h2>
          {product.add_on && (
            <div className="flex items-center rounded-full h-5 px-3 text-xs bg-zinc-200 border border-zinc-400 text-t3">
              Add On
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {customerData && (
            <Badge className="flex items-center gap-1 w-fit text-xs text-lime-600 bg-lime-50 border border-lime-200">
              <span className="">
                Managing <span className="font-bold">{product.name}</span> for
              </span>
              <span className="">
                <span className="font-bold">{customerData.customer.name}</span>
              </span>
            </Badge>
          )}
          {!customerData && (
            <EditProductToolbar product={product} className="text-t2" />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-md text-t2 font-medium">Entitlements</p>
        {product.entitlements.length > 0 && (
          <ProductEntitlementTable entitlements={product.entitlements} />
        )}
        <CreateEntitlement />
      </div>
      <div className="flex flex-col gap-4">
        <p className="text-md text-t2 font-medium">Pricing</p>
        {product.prices.length > 0 && (
          <ProductPricingTable prices={product.prices} />
        )}
        <CreatePrice />
      </div>
    </div>
  );
};
