"use client";

import React, { useState, useEffect, useRef } from "react";
import { AppEnv, FrontendProduct, Organization } from "@autumn/shared";

import { BreadcrumbItem, Breadcrumbs } from "@nextui-org/react";
import { useAxiosSWR } from "@/services/useAxiosSwr";

import LoadingScreen from "@/views/general/LoadingScreen";
import { useRouter } from "next/navigation";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CustomToaster } from "@/components/general/CustomToaster";
import { ManageProduct } from "@/views/products/product/ManageProduct";
import { ProductContext } from "@/views/products/product/ProductContext";

import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleDollar, faUpload } from "@fortawesome/pro-duotone-svg-icons";
import { CusService } from "@/services/customers/CusService";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  getBackendErr,
  getBackendErrObj,
  getRedirectUrl,
  navigateTo,
} from "@/utils/genUtils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { ErrCode } from "@autumn/shared";
import { AddProductButton } from "../add-product/AddProductButton";
import ErrorScreen from "@/views/general/ErrorScreen";

export default function CustomerProductView({
  product_id,
  customer_id,
  env,
  org,
}: {
  product_id: string;
  customer_id: string;
  env: AppEnv;
  org: Organization;
}) {
  const router = useRouter();
  const axiosInstance = useAxiosInstance({ env });
  const [product, setProduct] = useState<FrontendProduct | null>(null);
  const { data, isLoading, mutate, error } = useAxiosSWR({
    url: `/customers/${customer_id}/data`,
    env,
  });

  const [url, setUrl] = useState<string | null>(null);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const initialProductRef = useRef<FrontendProduct | null>(null);

  //get the product from the customer data and check if it is active
  useEffect(() => {
    if (!data?.products || !data?.customer) return;

    const foundProduct = data.products.find((p) => p.id === product_id);
    if (!foundProduct) return;

    const isActive = data.customer.products.some(
      (p) => p.product_id === product_id
    );
    const enrichedProduct = { ...foundProduct, isActive };

    setProduct(enrichedProduct);
    initialProductRef.current = enrichedProduct;
  }, [data, product_id]);

  //check if the user has made changes to the product state
  useEffect(() => {
    if (!initialProductRef.current || !product) {
      setHasChanges(false);
      return;
    }

    const hasChanged =
      JSON.stringify({
        prices: product.prices,
        entitlements: product.entitlements,
      }) !==
      JSON.stringify({
        prices: initialProductRef.current.prices,
        entitlements: initialProductRef.current.entitlements,
      });
    setHasChanges(hasChanged);
  }, [product]);

  if (error) {
    console.log("Use Axios SWR Error: ", error);
    return (
      <ErrorScreen>
        <p>
          Customer {customer_id} or product {product_id} not found
        </p>
      </ErrorScreen>
    );
  }

  if (isLoading) return <LoadingScreen />;

  const { products } = data;
  const { customer } = data;

  if (!product) {
    return <div>Product not found</div>;
  }

  const handleCreateProduct = async () => {
    console.log("Customer Product Updated", product);

    // TODO: Update product
    const entitlements = product.entitlements.map((e) => {
      return {
        id: e.id,
        feature_id: e.feature.id,

        allowance: e.allowance,
        allowance_type: e.allowance_type,
        interval: e.interval,
      };
    });

    try {
      const { data } = await CusService.addProduct(axiosInstance, customer_id, {
        product_id,
        prices: product.prices,
        entitlements,
      });

      if (data.checkout_url) {
        setUrl(data.checkout_url);
        setCheckoutDialogOpen(true);
      }
    } catch (error) {
      const errObj = getBackendErrObj(error);
      console.log("Error object:", errObj);
      if (errObj?.code === ErrCode.StripeConfigNotFound) {
        toast.error(errObj?.message);
        const redirectUrl = getRedirectUrl(`/customers/${customer_id}`, env);
        navigateTo(`/integrations/stripe?redirect=${redirectUrl}`, router, env);
      } else {
        toast.error(getBackendErr(error, "Error creating product"));
      }
    }
  };

  const getProductActionState = () => {
    if (product.isActive && !hasChanges) {
      return {
        buttonText: "Update Product",
        tooltipText: "No changes have been made to update",
        disabled: true,
      };
    }
    if (product.isActive) {
      return {
        buttonText: "Save Custom Version",
        tooltipText: `You're editing the live product ${product.name} and updating it to a custom version for ${customer.name}`,
        disabled: false,
      };
    }
    if (hasChanges) {
      return {
        buttonText: "Create Product Version",
        tooltipText: `You have edited product ${product.name} and are creating a custom version for ${customer.name}`,
        disabled: false,
      };
    }
    return {
      buttonText: "Enable Product",
      tooltipText: `Enable product ${product.name} for ${customer.name}`,
      disabled: false,
    };
  };

  const actionState = getProductActionState();

  return (
    <ProductContext.Provider
      value={{
        ...data,
        mutate,
        env,
        product,
        setProduct,
        prices: product.prices,
        entitlements: product.entitlements,
        org,
      }}
    >
      <CustomToaster />
      <Dialog
        open={checkoutDialogOpen}
        onOpenChange={() => {
          setCheckoutDialogOpen(false);
          setUrl(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Checkout</DialogTitle>
          </DialogHeader>

          {url && <CopyCheckoutURL url={url} />}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-2">
        <Breadcrumbs className="text-t3">
          <BreadcrumbItem
            size="sm"
            onClick={() => navigateTo("/customers", router, env)}
          >
            Customers
          </BreadcrumbItem>
          <BreadcrumbItem
            size="sm"
            onClick={() => navigateTo(`/customers/${customer_id}`, router, env)}
          >
            {customer.name}
          </BreadcrumbItem>
          <BreadcrumbItem size="sm">{product.name}</BreadcrumbItem>
        </Breadcrumbs>
        {product && <ManageProduct product={product} customerData={data} />}
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="gradientSecondary"
          className="w-fit gap-2"
          startIcon={<FontAwesomeIcon icon={faCircleDollar} />}
        >
          Configure Product Options
        </Button>
        <AddProductButton
          handleCreateProduct={handleCreateProduct}
          actionState={actionState}
        />
      </div>
    </ProductContext.Provider>
  );
}

export const CopyCheckoutURL = ({ url }: { url: string }) => {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-gray-500">This link will expire in 24 hours</p>
      <div className="w-full bg-gray-100 p-3 rounded-md">
        <Link
          className="text-xs text-t2 break-all hover:underline"
          href={url}
          target="_blank"
        >
          {url}
        </Link>
      </div>
    </div>
  );
};
