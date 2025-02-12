import FieldLabel from "@/components/general/modal-components/FieldLabel";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  CreateEntitlementSchema,
  Entitlement,
  Feature,
  FeatureType,
} from "@autumn/shared";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProductContext } from "@/views/products/product/ProductContext";
import { FeatureTypeBadge } from "@/views/features/FeatureTypeBadge";
import {
  AllowanceType,
  EntInterval,
  EntitlementWithFeature,
} from "@autumn/shared";
import { getFeature } from "@/utils/product/entitlementUtils";

export const EntitlementConfig = ({
  isUpdate = false,
  entitlement,
  setEntitlement,
}: {
  isUpdate?: boolean;
  entitlement: EntitlementWithFeature | Entitlement | null;
  setEntitlement: (entitlement: EntitlementWithFeature | null) => void;
}) => {
  const { features, product } = useProductContext();

  const [originalEntitlement, _] = useState<Entitlement | null>(
    entitlement || null
  );

  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(
    getFeature(entitlement?.internal_feature_id, features) || null
  );

  const [fields, setFields] = useState({
    allowance_type: entitlement?.allowance_type || AllowanceType.Fixed,
    allowance: entitlement?.allowance || 0,
    interval: entitlement?.interval || EntInterval.Month,
  });

  useEffect(() => {
    if (selectedFeature) {
      const newEnt = CreateEntitlementSchema.parse({
        internal_feature_id: selectedFeature.internal_id,
        feature_id: selectedFeature.id,
        ...fields,
      });

      const originalEnt = originalEntitlement ? originalEntitlement : null;
      setEntitlement({
        ...originalEnt,
        ...newEnt,
        feature: selectedFeature,
      });
    } else {
      setEntitlement(null);
    }
  }, [selectedFeature, fields, originalEntitlement, setEntitlement]);

  return (
    <div>
      <FieldLabel>Entitlement </FieldLabel>
      <Select
        value={selectedFeature?.internal_id}
        onValueChange={(value) =>
          setSelectedFeature(getFeature(value, features))
        }
        disabled={isUpdate}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a feature" />
        </SelectTrigger>
        <SelectContent>
          {features
            .filter((feature: Feature) => {
              if (selectedFeature?.internal_id == feature.internal_id) {
                return true;
              }
              const existingEnt = product.entitlements.find(
                (ent: Entitlement) =>
                  ent.internal_feature_id === feature.internal_id
              );
              return !existingEnt;
            })
            .map((feature: Feature) => (
              <SelectItem
                key={feature.internal_id}
                value={feature.internal_id!}
              >
                <div className="flex gap-2 items-center">
                  {feature.name}
                  <FeatureTypeBadge type={feature.type} />
                </div>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {selectedFeature && selectedFeature?.type != FeatureType.Boolean && (
        <div className="flex flex-col mt-4 text-sm">
          <FieldLabel>Allowance</FieldLabel>
          <Tabs
            defaultValue="fixed"
            className="mb-4"
            value={fields.allowance_type}
            onValueChange={(value) =>
              setFields({
                ...fields,
                allowance_type: value as AllowanceType,
              })
            }
          >
            <TabsList>
              <TabsTrigger value="fixed">Fixed</TabsTrigger>
              <TabsTrigger value="unlimited">Unlimited</TabsTrigger>
              {/* <TabsTrigger value="none">None</TabsTrigger> */}
            </TabsList>
            <TabsContent value="fixed">
              <div className="flex gap-2 items-center mt-4">
                <Input
                  placeholder="eg. 100"
                  className="w-30"
                  value={fields.allowance}
                  onChange={(e) =>
                    setFields({
                      ...fields,
                      allowance: Number(e.target.value),
                    })
                  }
                />
                <p className="text-t3 min-w-fit">per</p>
                <Select
                  value={fields.interval}
                  onValueChange={(value) =>
                    setFields({
                      ...fields,
                      interval: value as EntInterval,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(EntInterval).map((interval) => (
                      <SelectItem key={interval} value={interval}>
                        {interval}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};
