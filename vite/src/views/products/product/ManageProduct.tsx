import { AdminHover } from "@/components/general/AdminHover";
import { useProductContext } from "./ProductContext";
import { useNavigate } from "react-router";
import { useEnv } from "@/utils/envUtils";
import { ProductItemTable } from "./product-item/ProductItemTable";
import { SelectEntity } from "@/views/customers/customer/customer-sidebar/select-entity";

export const ManageProduct = ({
  hideAdminHover = false,
}: {
  hideAdminHover?: boolean;
}) => {
  const env = useEnv();
  const { isOnboarding, product, entityId, customer } = useProductContext();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pl-10 pr-10">
        <div className="col-span-2 flex">
          <div className="flex flex-col gap-1 justify-center w-full whitespace-nowrap">
            <AdminHover texts={[product.internal_id!]} hide={hideAdminHover}>
              <h2 className="text-lg font-medium w-fit whitespace-nowrap">
                {product.name}
              </h2>
            </AdminHover>
          </div>
        </div>
        {/* <EntityHeader entity={entity} /> */}
        {customer && (
          <SelectEntity entityId={entityId} entities={customer?.entities} />
        )}
      </div>

      <div className="flex flex-col gap-10">
        <ProductItemTable />
      </div>
    </div>
  );
};
