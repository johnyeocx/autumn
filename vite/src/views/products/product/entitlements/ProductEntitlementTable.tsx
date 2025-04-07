import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import React, { useState } from "react";
import { useNavigate } from "react-router";

import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { FeatureTypeBadge } from "@/views/features/FeatureTypeBadge";
import {
  AllowanceType,
  Entitlement,
  EntitlementWithFeature,
  FeatureType,
  PriceType,
} from "@autumn/shared";
import UpdateEntitlement from "./UpdateEntitlement";
import { useProductContext } from "../ProductContext";
import { getFeature } from "@/utils/product/entitlementUtils";
import { AdminHover } from "@/components/general/AdminHover";
import { getDefaultPriceConfig } from "@/utils/product/priceUtils";
export const ProductEntitlementTable = ({
  entitlements,
}: {
  entitlements: EntitlementWithFeature[];
}) => {
  const { features, product } = useProductContext();

  const [priceConfig, setPriceConfig] = useState<any>(
    getDefaultPriceConfig(PriceType.Usage) // default price config
  );

  // on open, set the price config by using the selected entitlement to search the product prices

  const [open, setOpen] = useState(false);
  const [selectedEntitlement, setSelectedEntitlement] =
    useState<Entitlement | null>(null);

  const handleRowClick = (entitlement: EntitlementWithFeature) => {
    setSelectedEntitlement(entitlement);

    const entitlementPrice = product.prices.find((price: any) => {
      return (
        price.config.internal_feature_id === entitlement?.internal_feature_id // find the price config that matches the entitlement internal feature id
      );
    });

    if (entitlementPrice) {
      console.log("entitlementPrice found", entitlementPrice);
      setPriceConfig(entitlementPrice.config);
    }

    setOpen(true);
  };

  const getAllowanceString = (entitlement: EntitlementWithFeature) => {
    const feature = getFeature(entitlement.internal_feature_id, features);

    if (feature?.type === FeatureType.Boolean) {
      return "";
    }

    if (entitlement.allowance_type != AllowanceType.Fixed) {
      return entitlement.allowance_type;
    }

    if (entitlement.entity_feature_id) {
      if (entitlement.interval === "lifetime") {
        return `${entitlement.allowance} / ${entitlement.entity_feature_id}`;
      }
      return `${entitlement.allowance} / ${entitlement.entity_feature_id} / ${entitlement.interval}`;
    }

    if (entitlement.interval === "lifetime") {
      return entitlement.allowance;
    }

    return `${entitlement.allowance} / ${entitlement.interval}`;
  };

  return (
    <>
      <UpdateEntitlement
        open={open}
        setOpen={setOpen}
        selectedEntitlement={selectedEntitlement}
        setSelectedEntitlement={setSelectedEntitlement}
        priceConfig={priceConfig}
        setPriceConfig={setPriceConfig}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="">Feature Name</TableHead>
            <TableHead>Feature ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Allowance</TableHead>
            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entitlements.map((entitlement: EntitlementWithFeature) => {
            const feature = getFeature(
              entitlement.internal_feature_id,
              features
            );

            return (
              <TableRow
                key={`${entitlement.id}-${feature?.id}`}
                className="cursor-pointer"
                onClick={() => handleRowClick(entitlement)}
              >
                <TableCell>
                  <AdminHover texts={[entitlement.id]}>
                    {feature?.name}
                  </AdminHover>
                </TableCell>
                <TableCell className="font-mono">{feature?.id}</TableCell>
                <TableCell>
                  <FeatureTypeBadge type={feature?.type} />
                </TableCell>
                <TableCell>{getAllowanceString(entitlement)}</TableCell>
                <TableCell className="min-w-20 w-24">
                  <span>
                    {formatUnixToDateTime(entitlement.created_at).date}
                  </span>{" "}
                  <span className="text-t3">
                    {formatUnixToDateTime(entitlement.created_at).time}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
};
