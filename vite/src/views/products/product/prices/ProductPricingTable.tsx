import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { Price, PriceType, UsagePriceConfig } from "@autumn/shared";
import React, { useState, useEffect } from "react";

import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { PricingTypeBadge } from "./PricingTypeBadge";
import UpdatePricing from "./UpdatePricing";
import { useProductContext } from "../ProductContext";
import {
  getBillingUnits,
  getDefaultPriceConfig,
} from "@/utils/product/priceUtils";
import { AdminHover } from "@/components/general/AdminHover";
import { CreateEntitlement } from "../entitlements/CreateEntitlement";
import UpdateEntitlement from "../entitlements/UpdateEntitlement";
import { getFeature } from "@/utils/product/entitlementUtils";

// import UpdatePricing from "./UpdatePricing";

export const ProductPricingTable = ({ prices }: { prices: Price[] }) => {
  const { org, product, features } = useProductContext();

  const [sortedPrices, setSortedPrices] = useState<
    (Price & { originalIndex: number })[]
  >([]);

  useEffect(() => {
    //original index allows us to keep track of which price should be deleted (SelectedIndex for fixed prices)
    const sorted = prices
      .map((price, index) => ({ ...price, originalIndex: index }))
      .sort((a, b) => {
        if (
          a.config?.type === PriceType.Fixed &&
          b.config?.type !== PriceType.Fixed
        ) {
          return -1;
        }
        if (
          a.config?.type !== PriceType.Fixed &&
          b.config?.type === PriceType.Fixed
        ) {
          return 1;
        }
        return 0;
      });
    setSortedPrices(sorted);
  }, [prices]);

  const [priceConfig, setPriceConfig] = useState<any>(
    getDefaultPriceConfig(PriceType.Usage) // default price config
  );

  const formatAmount = (config: any, type: string) => {
    const currency = org?.default_currency || "USD";
    if (type === "fixed") {
      // Handle fixed price - show all rates and periods
      const formattedAmount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
      }).format(config.amount);

      return (
        <React.Fragment>
          <span className="">{formattedAmount} </span>
          <span className="">
            {config.interval === "one_off"
              ? "one off"
              : `per ${config.interval}`}
          </span>
        </React.Fragment>
      );
    } else if (type === "usage") {
      // Handle usage price - just show min and max amounts
      const numUnits = getBillingUnits(config, product.entitlements!);
      const formatUsageAmount = (amount: number) => {
        const currency = org?.default_currency || "USD";
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency,
          minimumFractionDigits: 0, // Allow any number of decimal places
          maximumFractionDigits: 10, // Maximum of 10 decimal places
        }).format(amount);
      };
      if (config.usage_tiers.length > 1) {
        const amounts = config.usage_tiers.map((tier: any) => tier.amount);
        const minAmount = formatUsageAmount(Math.min(...amounts));
        const maxAmount = formatUsageAmount(Math.max(...amounts));

        return (
          <>
            {minAmount} - {maxAmount}{" "}
            <span className="text-t3">per {numUnits} </span>
          </>
        );
      }

      // Single tier - just show the amount
      const amount = formatUsageAmount(config.usage_tiers[0].amount);
      if (config.billing_units == 1) {
        //get feature name from feature id
        const foundFeature = getFeature(config.internal_feature_id, features);

        return (
          <>
            {amount}{" "}
            <span className="">
              per {foundFeature ? foundFeature.name : config.feature_id}
            </span>
            <span className="text-t3">&nbsp;per {config.interval}</span>
          </>
        );
      } else {
        return (
          <>
            {amount} <span className="text-t3">per {numUnits} units</span>
          </>
        );
      }
    }
    return "";
  };

  const [open, setOpen] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<Price | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleRowClick = (price: Price, index: number) => {
    //get the

    //if price type is fixed, set the price config to the price config
    if (price.config?.type === PriceType.Fixed) {
      setPriceConfig(price.config);
      setSelectedPrice(null);
      setSelectedIndex(index);
      setOpen(true);
      return;
    }
    const entitlementPrice = product.entitlements.find((entitlement: any) => {
      return (
        price.config?.type === PriceType.Usage &&
        entitlement.internal_feature_id ===
          (price.config as UsagePriceConfig).internal_feature_id
      );
    });

    if (entitlementPrice) {
      setSelectedPrice(entitlementPrice); //set the entielement to the found entitlement that matches the price internal ID
    }
    setPriceConfig(price.config);

    setSelectedIndex(index);
    setOpen(true);
  };

  return (
    <>
      <UpdateEntitlement
        open={open}
        setOpen={setOpen}
        selectedEntitlement={selectedPrice}
        setSelectedEntitlement={setSelectedPrice}
        priceConfig={priceConfig}
        setPriceConfig={setPriceConfig}
        selectedIndex={selectedIndex}
      />
      <div className="flex flex-col text-sm  rounded-sm">
        <div className="flex items-center grid grid-cols-10 gap-8 justify-between bg-stone-100 border-y pl-10 h-10">
          <h2 className="text-sm text-t2 font-medium col-span-2 flex">
            Pricing
          </h2>
          <div className="flex w-full h-full items-center col-span-8 justify-end">
            <div className="flex w-fit h-full items-center">
              <CreateEntitlement buttonType={"price"} />
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          {sortedPrices.map((price) => {
            let rowPriceConfig = price.config;
            if (price.config?.type === PriceType.Usage) {
              rowPriceConfig = price.config as UsagePriceConfig;
            }

            return (
              <div
                key={price.originalIndex}
                className="flex grid grid-cols-10 gap-8 px-10 text-t2 h-10 items-center hover:bg-zinc-50 cursor-pointer"
                onClick={() => handleRowClick(price, price.originalIndex)}
              >
                <span className="font-mono text-t3 col-span-2 flex">
                  <AdminHover
                    texts={[
                      { key: "ID", value: price.id! },
                      {
                        key: "Internal Feature ID",
                        value:
                          (price.config as UsagePriceConfig)
                            .internal_feature_id || "N/A",
                      },
                      {
                        key: "Stripe Meter ID",
                        value:
                          (price.config as UsagePriceConfig).stripe_meter_id ||
                          "N/A",
                      },
                      {
                        key: "Stripe Price ID",
                        value:
                          (price.config as UsagePriceConfig).stripe_price_id ||
                          "N/A",
                      },
                      {
                        key: "Stripe Product ID",
                        value:
                          (price.config as UsagePriceConfig)
                            .stripe_product_id || "N/A",
                      },
                    ]}
                  >
                    {price.config?.type === PriceType.Usage
                      ? (price.config as UsagePriceConfig).feature_id
                      : ""}
                  </AdminHover>
                </span>
                <span className="col-span-5">
                  {formatAmount(price.config, price.config?.type || "")}
                </span>
                <span className="col-span-2">
                  <PricingTypeBadge type={price.config?.type || ""} />
                </span>
                <span className="flex text-xs text-t3 items-center col-span-1 whitespace-nowrap">
                  {formatUnixToDateTime(price.created_at).date}{" "}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
