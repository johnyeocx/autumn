import { notNullish } from "@/utils/genUtils.js";
import { Feature, Event, FeatureType } from "@autumn/shared";

import { AggregateType } from "@autumn/shared";
import { Decimal } from "decimal.js";

const DEFAULT_VALUE = 1;

export const getMeteredDeduction = (meteredFeature: Feature, event: Event) => {
  let config = meteredFeature.config;
  let aggregate = config.aggregate;

  if (aggregate.type == AggregateType.Count) {
    return 1;
  }

  let value = notNullish(event.value)
    ? event.value
    : notNullish(event.properties.value)
    ? event.properties.value
    : DEFAULT_VALUE;

  let floatVal = parseFloat(value);
  if (isNaN(floatVal)) {
    return 0;
  }

  if (
    meteredFeature.type == FeatureType.CreditSystem ||
    aggregate.type == AggregateType.Sum
  ) {
    return value;
  }

  return 0;
};

export const getCreditSystemDeduction = ({
  meteredFeatures,
  creditSystem,
  event,
}: {
  meteredFeatures: Feature[];
  creditSystem: Feature;
  event: Event;
}) => {
  let creditsUpdate = 0;
  let meteredFeatureIds = meteredFeatures.map((feature) => feature.id);

  for (const schema of creditSystem.config.schema) {
    if (meteredFeatureIds.includes(schema.metered_feature_id)) {
      let meteredFeature = meteredFeatures.find(
        (feature) => feature.id === schema.metered_feature_id
      );

      if (!meteredFeature) {
        continue;
      }

      let meteredDeduction = getMeteredDeduction(meteredFeature, event);

      let meteredDeductionDecimal = new Decimal(meteredDeduction);
      let featureAmountDecimal = new Decimal(schema.feature_amount);
      let creditAmountDecimal = new Decimal(schema.credit_amount);
      creditsUpdate += meteredDeductionDecimal
        .div(featureAmountDecimal)
        .mul(creditAmountDecimal)
        .toNumber();
    }
  }

  return creditsUpdate;
};
