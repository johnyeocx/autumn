import {
  Feature,
  FeatureType,
  ProductItem,
  ProductItemInterval,
  ProductItemType,
  UsageUnlimited,
} from "@autumn/shared";
import { useProductContext } from "../ProductContext";
import { CreateProductItem } from "./CreateProductItem";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import {
  formatAmount,
  getItemType,
  intervalIsNone,
} from "@/utils/product/productItemUtils";
import UpdateProductItem from "./UpdateProductItem";
import { useState } from "react";
export const ProductItemTable = () => {
  let { product, features, org } = useProductContext();
  let [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
  let [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  let [open, setOpen] = useState(false);

  const getFreeFeatureString = (item: ProductItem) => {
    const feature = features.find((f: Feature) => f.id == item.feature_id);

    if (feature?.type === FeatureType.Boolean) {
      return "";
    }

    if (item.included_usage == UsageUnlimited) {
      return "Unlimited";
    }

    if (item.reset_usage_on_interval) {
      return `${item.included_usage}`;
    }

    return `${item.included_usage} / ${item.interval}`;
  };

  const getPaidFeatureString = (item: ProductItem) => {
    let amountStr = "";

    if (item.amount) {
      amountStr = formatAmount({
        defaultCurrency: org?.default_currency || "USD",
        amount: item.amount,
      });
    } else if (item.tiers && item.tiers.length == 1) {
      amountStr = formatAmount({
        defaultCurrency: org?.default_currency || "USD",
        amount: item.tiers![0].amount,
      });
    } else {
      amountStr = `${formatAmount({
        defaultCurrency: org?.default_currency || "USD",
        amount: item.tiers![0].amount,
      })} - ${formatAmount({
        defaultCurrency: org?.default_currency || "USD",
        amount: item.tiers![item.tiers!.length - 1].amount,
      })}`;
    }

    let feature = features.find((f: Feature) => f.id == item.feature_id);

    amountStr += ` per ${item.billing_units! > 1 ? item.billing_units : ""}${
      feature?.name
    }`;

    if (!intervalIsNone(item.interval)) {
      amountStr += ` per ${item.interval}`;
    }

    if (item.included_usage) {
      return `${item.included_usage} ${feature?.name} free, then ${amountStr}`;
    } else {
      return amountStr;
    }
  };

  const getFixedPriceString = (item: ProductItem) => {
    let currency = org?.default_currency || "USD";
    let formattedAmount = formatAmount({
      defaultCurrency: currency,
      amount: item.amount!,
    });

    if (!intervalIsNone(item.interval)) {
      return `${formattedAmount} per ${item.interval}`;
    }

    return `${formattedAmount}`;
  };

  let handleRowClick = (item: ProductItem, index: number) => {
    console.log("Item clicked", item);
    setSelectedItem(item);
    setSelectedIndex(index);
    setOpen(true);
  };

  return (
    <>
      <UpdateProductItem
        selectedItem={selectedItem}
        selectedIndex={selectedIndex}
        setSelectedItem={setSelectedItem}
      />
      <div className="flex flex-col text-sm rounded-sm">
        <div className="flex items-center grid grid-cols-10 gap-8 justify-between border-y bg-stone-100 pl-10 h-10">
          <h2 className="text-sm text-t2 font-medium col-span-2 flex">
            Features
          </h2>
          <div className="flex w-full h-full items-center col-span-8 justify-end">
            <div className="flex w-fit h-full items-center">
              <CreateProductItem />
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          {product.items.map((item: ProductItem, index: number) => {
            let feature = features.find((feature: Feature) => {
              return feature.id === item.feature_id;
            });

            let itemType = getItemType(item);

            return (
              <div
                key={index}
                className="flex grid grid-cols-10 gap-8 px-10 text-t2 h-10 items-center hover:bg-primary/3 pr-4"
                onClick={() => handleRowClick(item, index)}
              >
                <span className="font-mono text-t3 col-span-2 overflow-hidden flex whitespace-nowrap">
                  {feature?.name || "Fixed Price"}
                </span>
                <span className="col-span-6">
                  {itemType === ProductItemType.Feature
                    ? getFreeFeatureString(item)
                    : itemType === ProductItemType.Price
                    ? getFixedPriceString(item)
                    : getPaidFeatureString(item)}
                </span>
                <span className="col-span-1">
                  {/* {price && (
                    <Badge
                      variant={"outline"}
                      className="items-center gap-1 py-1 px-2 text-t2"
                    >
                      <CircleDollarSign className="w-4 h-4 text-yellow-500" />
                    </Badge>
                  )} */}
                </span>
                <span className="flex text-xs text-t3 items-center col-span-1 whitespace-nowrap justify-end">
                  {item.created_at
                    ? formatUnixToDateTime(item.created_at).date
                    : formatUnixToDateTime(Math.floor(Date.now())).date}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
