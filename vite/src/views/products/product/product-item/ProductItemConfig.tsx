import {
  Feature,
  FeatureType,
  Infinite,
  ProductItemInterval,
  TierInfinite,
} from "@autumn/shared";
import { useEffect, useState } from "react";
import { useProductContext } from "@/views/products/product/ProductContext";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "./ProductItemContext";
import { getShowParams } from "@/utils/product/productItemUtils";
import { ConfigWithFeature } from "./components/ConfigWithFeature";
import FixedPriceConfig from "./components/ConfigFixedPrice";
import { getFeature } from "@/utils/product/entitlementUtils";

export const ProductItemConfig = () => {
  // HOOKS
  const { features, product, env } = useProductContext();
  const navigate = useNavigate();

  const {
    item,
    setItem,
    isUpdate,
    handleCreateProductItem,
    handleUpdateProductItem,
    handleDeleteProductItem,
  } = useProductItemContext();

  const [show, setShow] = useState(getShowParams(item));

  const selectedFeature = features.find(
    (f: Feature) => f.id == item.feature_id
  );

  useEffect(() => {
    // if show price is changed to false, remove the "amount" from the item
    if (show.price) {
      // setItem({ ...item, amount: null });
    }
  }, [show]);

  // if item type is boolean, remove everything except for the feature_id. use getFeature to check if the item is boolean
  // useEffect(() => {
  //   if (getFeature(item.feature_id, features)?.type === FeatureType.Boolean) {
  //     setItem({
  //       feature_id: item.feature_id,
  //       amount: null,
  //       tiers: null,
  //       billing_units: null,
  //       included_usage: null,
  //       reset_usage_on_billing: null,
  //       carry_over_usage: null,
  //       entity_feature_id: null,
  //     });
  //   }
  // }, [item.feature_id, features]);

  const handleAddPrice = () => {
    setItem({
      ...item,
      tiers: [
        {
          to: TierInfinite,
          amount: item.amount ?? 0,
        },
      ],
      interval: ProductItemInterval.Month,
    });
    setShow({ ...show, price: !show.price });
    // } else {
    //   setItem({
    //     ...item,
    //     tiers: null,
    //   });
    //   setShow({ ...show, price: true });
    // }
  };

  const toggleShowFeature = () => {
    if (show.feature) {
      // Remove feature
      setItem({
        ...item,
        feature_id: null,
        tiers: null,
        amount: 0,
        interval: ProductItemInterval.Month,
      });
      setShow({ ...show, feature: !show.feature });
    } else {
      // Add feature
      setItem({
        ...item,
        amount: null,
        feature_id: null,
        tiers: null,
        interval: ProductItemInterval.Month,
      });
      setShow({ ...show, price: false, feature: true });
    }
  };

  useEffect(() => {
    setShow(getShowParams(item));
  }, []);

  // return <></>;

  return (
    <div
      className={cn(
        "flex flex-col gap-6 w-lg transition-all ease-in-out duration-300", //modal animations
        !show.feature && "w-xs",
        show.feature && show.price && "w-xl",
        show.price && show.feature && item.tiers?.length > 1 && "w-2xl"
      )}
    >
      {!show.feature ? (
        <div className="flex w-full">
          <FixedPriceConfig show={show} setShow={setShow} />
        </div>
      ) : (
        <ConfigWithFeature
          show={show}
          setShow={setShow}
          handleAddPrice={handleAddPrice}
        />
      )}
      <div className="flex animate-in slide-in-from-bottom-1/2 duration-200 fade-out w-full justify-end">
        <div className="flex flex-col justify-between gap-10 w-full">
          <div className="flex gap-6 w-full">
            <div className="flex gap-2 w-full ">
              <Button
                variant="outline"
                onClick={handleAddPrice}
                disabled={item.included_usage == Infinite}
                className={cn(
                  "w-0 max-w-0 p-0 overflow-hidden transition-all duration-200 ease-in-out",
                  !show.price &&
                    show.feature &&
                    getFeature(item.feature_id, features)?.type !=
                      FeatureType.Boolean
                    ? "w-full max-w-32 mr-0 p-2"
                    : "w-0 max-w-0 p-0 border-none"
                )}
              >
                <PlusIcon size={14} className="mr-1" />
                Add Price
              </Button>
              <Button
                className={cn(
                  "w-0 max-w-0 p-0 overflow-hidden transition-all duration-200 ease-in-out -ml-2",
                  !show.feature && !isUpdate
                    ? "w-full max-w-32 mr-0 p-2"
                    : "w-0 max-w-0 p-0 border-none"
                )}
                variant="outline"
                onClick={() => {
                  setShow({
                    ...show,
                    feature: true,
                    price: item.amount > 0 ? true : false,
                  });
                  setItem({
                    ...item,
                    tiers: item.amount
                      ? [
                          {
                            to: TierInfinite,
                            amount: item.amount ?? 0,
                          },
                        ]
                      : null,
                  });
                }}
              >
                <PlusIcon size={14} className="mr-1" />
                Add Feature
              </Button>
            </div>
            <div className="flex gap-2 w-full ">
              {handleDeleteProductItem && (
                <Button
                  variant="destructive"
                  // disabled={!selectedFeature}
                  className="w-32 max-w-64 "
                  // size="sm"
                  onClick={() => {
                    handleDeleteProductItem();
                  }}
                >
                  Delete
                </Button>
              )}
              {handleUpdateProductItem && (
                <Button
                  variant="gradientPrimary"
                  // disabled={!selectedFeature}
                  className="w-full"
                  onClick={() => {
                    handleUpdateProductItem(show);
                  }}
                >
                  Update Item
                </Button>
              )}
              {handleCreateProductItem && (
                <Button
                  variant="gradientPrimary"
                  disabled={!selectedFeature && !item.amount}
                  className="w-full"
                  onClick={() => {
                    handleCreateProductItem(show);
                  }}
                >
                  Add to Product
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
