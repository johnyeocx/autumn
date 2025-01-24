import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  BillingInterval,
  BillWhen,
  Entitlement,
  EntitlementWithFeature,
} from "@autumn/shared";
import React from "react";
import { keyToTitleFirstCaps } from "@/utils/formatUtils/formatTextUtils";
import { Button } from "@/components/ui/button";
import { cn } from "@nextui-org/theme";
import { faXmark } from "@fortawesome/pro-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductContext } from "../ProductContext";

function CreateUsagePrice({
  config,
  setConfig,
  usageTiers,
  setUsageTiers,
}: {
  config: any;
  setConfig: (config: any) => void;
  usageTiers: any[];
  setUsageTiers: (usageTiers: any[]) => void;
}) {
  const { entitlements, env } = useProductContext();

  const setUsageTier = (index: number, key: string, value: string) => {
    const newUsageTiers = [...config.usage_tiers];
    newUsageTiers[index] = { ...newUsageTiers[index], [key]: value };
    setConfig({ ...config, usage_tiers: newUsageTiers });
  };

  const handleAddTier = () => {
    const newUsageTiers = [...config.usage_tiers];
    // First, change the last tier to be 0
    const lastTier = newUsageTiers[newUsageTiers.length - 1];
    if (lastTier.to == -1) {
      newUsageTiers[newUsageTiers.length - 1].to = 0;
    }
    newUsageTiers.push({ from: 0, to: -1, amount: 0.0 });
    setConfig({ ...config, usage_tiers: newUsageTiers });
  };

  const handleRemoveTier = (index: number) => {
    const newUsageTiers = [...config.usage_tiers];
    newUsageTiers.splice(index, 1);
    newUsageTiers[newUsageTiers.length - 1].to = -1;
    setConfig({ ...config, usage_tiers: newUsageTiers });
  };

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* Entitlement */}
      <div className="flex gap-2 w-full">
        <div className="w-6/12">
          <FieldLabel>Entitlement</FieldLabel>
          <Select
            value={config.entitlement_id}
            onValueChange={(value) => {
              setConfig({
                ...config,
                entitlement_id: value as string,
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select entitlement" />
            </SelectTrigger>
            <SelectContent>
              {entitlements.map((entitlement: EntitlementWithFeature) => (
                <SelectItem key={entitlement.id} value={entitlement.id!}>
                  {entitlement.feature?.name}{" "}
                  <span className="text-t3">({entitlement.feature?.id})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-6/12">
          <FieldLabel>Bill When</FieldLabel>
          <Select
            value={config.bill_when}
            onValueChange={(value) =>
              setConfig({ ...config, bill_when: value as BillWhen })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Bill when" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(BillWhen).map((item) => (
                <SelectItem key={item} value={item}>
                  {keyToTitleFirstCaps(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Price */}
      <div className="flex gap-2 w-full">
        {[BillWhen.InAdvance].includes(config.bill_when) && (
          <div className="w-6/12">
            <FieldLabel>Interval</FieldLabel>
            <Select
              value={config.interval}
              onValueChange={(value) =>
                setConfig({ ...config, interval: value as BillingInterval })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Interval" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BillingInterval).map((item) => (
                  <SelectItem key={item} value={item}>
                    {keyToTitleFirstCaps(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-t3 text-sm mt-2 mb-2">Tiers</p>
        <div className="flex">
          <p className="w-4/12 text-t3 text-xs">From</p>
          <p className="w-4/12 text-t3 text-xs">To</p>
          <p className="w-4/12 text-t3 text-xs">Amount</p>
        </div>

        {config.usage_tiers.map((tier, index) => (
          <div key={index} className="flex gap-1 w-full items-center">
            <div className="w-full flex items-center">
              <div className="flex w-4/12 text-sm">
                <UsageTierInput
                  value={tier.from}
                  onChange={(e) => setUsageTier(index, "from", e.target.value)}
                  isAmount={false}
                  config={config}
                  entitlements={entitlements}
                />
              </div>
              <div
                className={cn(
                  "flex w-4/12 text-sm",
                  tier.to == -1 && "bg-transparent"
                )}
              >
                <UsageTierInput
                  value={tier.to}
                  onChange={(e) => setUsageTier(index, "to", e.target.value)}
                  isAmount={false}
                  config={config}
                  entitlements={entitlements}
                />
              </div>
              <div className="flex w-4/12 text-sm items-center">
                <UsageTierInput
                  value={tier.amount}
                  onChange={(e) =>
                    setUsageTier(index, "amount", e.target.value)
                  }
                  isAmount={true}
                  config={config}
                  entitlements={entitlements}
                />
              </div>
            </div>
            {config.usage_tiers.length > 1 && (
              <Button
                isIcon
                size="sm"
                variant="ghost"
                className="w-fit text-t3"
                onClick={() => handleRemoveTier(index)}
                dim={6}
              >
                <FontAwesomeIcon icon={faXmark} />
              </Button>
            )}
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="w-fit mt-2"
          onClick={handleAddTier}
        >
          Add Tier
        </Button>
      </div>
    </div>
  );
}

export default CreateUsagePrice;

export const UsageTierInput = ({
  value,
  onChange,
  isAmount,
  config,
  entitlements,
}: {
  value: number;
  onChange: (e: any) => void;
  isAmount: boolean;
  config?: any;
  entitlements?: any[];
}) => {
  if (!isAmount && value == -1) {
    return (
      <Input
        className="outline-none bg-transparent shadow-none flex-grow mr-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        value="♾️"
        disabled
        type="text"
      />
    );
  }

  return (
    <div className="relative flex-grow mr-1">
      <Input
        className="outline-none w-full pr-16 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        onChange={onChange}
        type="number"
        step="any"
      />
      {isAmount && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-t3 text-[10px]">
          /{" "}
          {entitlements?.find((e) => e.id == config?.entitlement_id)
            ?.allowance || "n"}{" "}
          units
        </span>
      )}
    </div>
  );
};
