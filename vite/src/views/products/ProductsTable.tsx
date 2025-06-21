import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { Product } from "@autumn/shared";
import { useNavigate } from "react-router";
import { ProductRowToolbar } from "./components/ProductRowToolbar";
import { navigateTo } from "@/utils/genUtils";
import { useProductsContext } from "./ProductsContext";
import { AdminHover } from "@/components/general/AdminHover";
import { Item, Row } from "@/components/general/TableGrid";
import CopyButton from "@/components/general/CopyButton";
import { cn } from "@/lib/utils";
import { ProductCountsTooltip } from "./components/ProductCountsTooltip";
import { ProductTypeBadge } from "./components/ProductTypeBadge";

export const ProductsTable = ({
  products,
  onRowClick,
}: {
  products: Product[];
  onRowClick?: (id: string) => void;
}) => {
  const { env, onboarding } = useProductsContext();
  const navigate = useNavigate();
  const { allCounts } = useProductsContext();

  console.log("products", products);

  return (
    <>
      {products && products.length > 0 ? (
        <Row
          type="header"
          className={cn("grid-cols-18 -mb-1", onboarding && "grid-cols-12")}
          isOnboarding={onboarding}
        >
          <Item className="col-span-3">Name</Item>
          <Item className="col-span-3">Product ID</Item>
          {!onboarding && (
            <>
              <Item className="col-span-3">Active</Item>
              <Item className="col-span-3">Type</Item>
              <Item className="col-span-3">Group</Item>
              <Item className="col-span-2">Created At</Item>
            </>
          )}
          <Item className={cn("col-span-1", onboarding && "col-span-6")}></Item>
        </Row>
      ) : (
        !onboarding && (
          <div
            className={cn(
              "flex flex-col justify-center items-center h-10 px-10 text-t3 min-h-[60vh] gap-4",
              onboarding && "px-2 mt-4",
            )}
          >
            <img
              src="./product.png"
              alt="Products"
              className="w-48 h-48 opacity-60 filter grayscale"
              // className="w-48 h-48 opacity-80 filter brightness-0 invert" // this is for dark mode
            />
            <span className="text-center">
              Products define the features your customers can access and how much{" "}
              <br />
              they cost. Create your first product to get started ☝️.
            </span>
          </div>
        )
      )}

      {products &&
        products.map((product) => (
          <Row
            key={product.id}
            className={cn(
              "grid-cols-18 gap-2 items-center text-sm cursor-pointer hover:bg-primary/5 text-t2 whitespace-nowrap",
              onboarding && "grid-cols-12",
            )}
            isOnboarding={onboarding}
            onClick={() => {
              if (onRowClick) {
                onRowClick(product.id);
              } else {
                navigateTo(`/products/${product.id}`, navigate, env);
              }
            }}
          >
            <Item className="col-span-3">
              <AdminHover
                texts={[
                  { key: "Internal ID", value: product.internal_id },
                  { key: "Version", value: product.version.toString() },
                ]}
              >
                <span className="truncate">{product.name}</span>
              </AdminHover>
            </Item>
            <Item className="col-span-3 font-mono  -translate-x-1">
              <CopyButton
                text={product.id || ""}
                className="bg-transparent text-t3 border-none px-1 shadow-none max-w-full"
              >
                <span className="truncate">{product.id}</span>
              </CopyButton>
            </Item>
            {!onboarding && (
              <>
                <Item className="col-span-3">
                  <ProductCountsTooltip
                    allCounts={allCounts}
                    product={product}
                  />
                </Item>
                <Item className="col-span-3">
                  <ProductTypeBadge product={product} />
                </Item>
                <Item className="col-span-3">
                  {!onboarding && product.group}
                </Item>
                <Item className="col-span-2 lg:overflow-visible text-t3 text-xs">
                  {formatUnixToDateTime(product.created_at).date}
                </Item>
              </>
            )}
            <Item
              className={cn(
                "col-span-1 items-center justify-end",
                onboarding && "col-span-6",
              )}
            >
              <ProductRowToolbar product={product} />
            </Item>
          </Row>
        ))}
    </>
  );
};
