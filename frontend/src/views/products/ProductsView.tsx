"use client";

import React, { useEffect, useState } from "react";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import LoadingScreen from "../general/LoadingScreen";
import { Product } from "@autumn/shared";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

import ProductView from "./product/ProductView";
import { ProductsContext } from "./ProductsContext";
import { AppEnv } from "@autumn/shared";
import { CustomToaster } from "@/components/general/CustomToaster";
import CreateProduct from "./CreateProduct";
import Link from "next/link";
import { ProductsTable } from "./ProductsTable";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTicketSimple } from "@fortawesome/pro-duotone-svg-icons";
import { CouponsTable } from "./coupons/CouponsTable";
import CreateCoupon from "./coupons/CreateCoupon";

function ProductsView({ env }: { env: AppEnv }) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCoupons, setShowCoupons] = useState(false);
  const { data, isLoading, mutate } = useAxiosSWR({
    url: `/products/data`,
    env: env,
    withAuth: true,
  });

  useEffect(() => {
    if (data?.products.length > 0 && !selectedProduct) {
      setSelectedProduct(data.products[0]);
    }

    if (data?.coupons.length > 0) {
      setShowCoupons(true);
    }
  }, [data]);

  if (isLoading) return <LoadingScreen />;
  const { products, features, creditSystems, stripeProducts } = data;

  return (
    <ProductsContext.Provider
      value={{
        ...data,
        env,
        selectedProduct,
        setSelectedProduct,
        mutate,
      }}
    >
      <CustomToaster />

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-medium">Products</h1>
          <p className="text-sm text-t2">
            Create the products your users can purchase.
          </p>
        </div>
        <ToggleDisplayButton
          show={showCoupons}
          disabled={data?.coupons.length > 0}
          onClick={() => setShowCoupons((prev) => !prev)}
        >
          <FontAwesomeIcon icon={faTicketSimple} className="mr-2" />
          Coupons
        </ToggleDisplayButton>
      </div>

      <ProductsTable products={data?.products} />
      <CreateProduct />
      {showCoupons && (
        <div className="flex flex-col gap-4 h-fit mt-6">
          <div>
            <h2 className="text-lg font-medium">Coupons</h2>
            <p className="text-sm text-t2">
              Create a coupon to give users credits or a discount on one or more
              products.{" "}
              <span className="text-t3">(eg, 10% off all products).</span>
            </p>
          </div>
          <CouponsTable />
          <CreateCoupon />
        </div>
      )}
    </ProductsContext.Provider>
  );
}

export default ProductsView;
