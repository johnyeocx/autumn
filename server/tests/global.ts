import dotenv from "dotenv";
dotenv.config();
import {
  AggregateType,
  AllowanceType,
  AppEnv,
  BillingInterval,
  CouponDurationType,
  DiscountType,
  EntInterval,
  Feature,
  RewardTriggerEvent,
} from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import {
  initReward,
  initEntitlement,
  initFeature,
  initFreeTrial,
  initPrice,
  initProduct,
  initRewardTrigger,
} from "./utils/init.js";
import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const features: Record<string, Feature & { eventName: string }> = {
  boolean1: initFeature({
    id: "boolean1",
    type: FeatureType.Boolean,
  }),
  metered1: initFeature({
    id: "metered1",
    type: FeatureType.Metered,
    aggregateType: AggregateType.Sum,
    groupBy: "user_id",
    eventName: "metered_1",
  }),
  infinite1: initFeature({
    id: "infinite1",
    type: FeatureType.Metered,
  }),
  metered2: initFeature({
    id: "metered2",
    type: FeatureType.Metered,
    aggregateType: AggregateType.Count,
    eventName: "metered_2",
  }),

  // GPU SYSTEM
  gpu1: initFeature({
    id: "gpu1",
    type: FeatureType.Metered,
    groupBy: "user_id",
  }),
  gpu2: initFeature({
    id: "gpu2",
    type: FeatureType.Metered,
    groupBy: "user_id",
  }),

  // In arrear prorated
  seats: initFeature({
    id: "seats",
    type: FeatureType.Metered,
  }),
};

export const creditSystems = {
  gpuCredits: initFeature({
    id: "gpuCredits",
    type: FeatureType.CreditSystem,
    creditSchema: [
      {
        metered_feature_id: features.gpu1.id,
        feature_amount: 1,
        credit_amount: 0.01,
      },
      {
        metered_feature_id: features.gpu2.id,
        feature_amount: 1,
        credit_amount: 0.0213,
      },
    ],
  }),
};

export const products = {
  free: initProduct({
    id: "free",
    isDefault: true,
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 5,
        interval: EntInterval.Month,
      }),
    },
    prices: [],
    freeTrial: null,
  }),

  pro: initProduct({
    id: "pro",
    entitlements: {
      boolean1: initEntitlement({
        feature: features.boolean1,
      }),
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 10,
        interval: EntInterval.Month,
      }),
      infinite1: initEntitlement({
        feature: features.infinite1,
        allowanceType: AllowanceType.Unlimited,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
      }),
    ],
    freeTrial: null,
  }),

  oneTimeAddOnMetered1: initProduct({
    id: "one-time-add-on-metered-1",
    isAddOn: true,
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 0,
        interval: EntInterval.Lifetime,
      }),
    },
    prices: [
      initPrice({
        type: "in_advance",
        billingInterval: BillingInterval.OneOff,
        feature: features.metered1,
      }),
    ],
    freeTrial: null,
  }),

  monthlyAddOnMetered1: initProduct({
    id: "monthly-add-on-metered-1",
    isAddOn: true,
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 0,
        interval: EntInterval.Month,
      }),
    },
    prices: [
      initPrice({
        type: "in_advance",
        billingInterval: BillingInterval.Month,
        feature: features.metered1,
      }),
    ],
    freeTrial: null,
  }),

  proWithOverage: initProduct({
    id: "pro-with-overage",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 10,
        interval: EntInterval.Month,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        billingInterval: BillingInterval.Month,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: features.metered1,
      }),
    ],
    freeTrial: null,
  }),

  proOnlyUsage: initProduct({
    id: "pro-only-usage",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 0,
        allowanceType: AllowanceType.Fixed,
        interval: EntInterval.Month,
      }),
    },

    prices: [
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: features.metered1,
      }),
    ],
    freeTrial: null,
  }),

  proWithTrial: initProduct({
    id: "pro-with-trial",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 10,
        interval: EntInterval.Month,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
      }),
    ],
    freeTrial: initFreeTrial({
      length: 7,
      uniqueFingerprint: true,
    }),
  }),

  premium: initProduct({
    id: "premium",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 100,
        interval: EntInterval.Month,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 50,
      }),
    ],
    freeTrial: null,
  }),

  premiumWithTrial: initProduct({
    id: "premium-with-trial",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 100,
        interval: EntInterval.Month,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 50,
      }),
    ],
    freeTrial: initFreeTrial({
      length: 7,
      uniqueFingerprint: true,
    }),
  }),

  monthlyWithOneTime: initProduct({
    id: "mothlyWithOneTime",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 0,
        interval: EntInterval.Lifetime,
      }),
      metered2: initEntitlement({
        feature: features.metered2,
        allowance: 0,
        interval: EntInterval.Lifetime,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
      }),
      initPrice({
        type: "in_advance",
        billingInterval: BillingInterval.OneOff,
        feature: features.metered1,
        amount: 100,
      }),
      initPrice({
        type: "in_advance",
        billingInterval: BillingInterval.OneOff,
        feature: features.metered2,
        amount: 200,
      }),
    ],
    freeTrial: null,
  }),
};

export const oneTimeProducts = {
  oneTimeMetered1: initProduct({
    id: "oneTimeMetered1",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 500,
        interval: EntInterval.Lifetime,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        billingInterval: BillingInterval.OneOff,
        feature: features.metered1,
        amount: 100,
      }),
    ],
    freeTrial: null,
  }),
  oneTimeMetered2: initProduct({
    id: "oneTimeMetered2",
    entitlements: {
      metered2: initEntitlement({
        feature: features.metered2,
        allowance: 0,
        interval: EntInterval.Lifetime,
      }),
    },
    prices: [
      initPrice({
        type: "in_advance",
        billingInterval: BillingInterval.OneOff,
        feature: features.metered2,
        amount: 0.01,
      }),
    ],
    freeTrial: null,
  }),
};

export const advanceProducts = {
  // GPU SYSTEM
  gpuSystemStarter: initProduct({
    id: "gpu-system-starter",
    entitlements: {
      gpuCredits: initEntitlement({
        allowance: 500,
        feature: creditSystems.gpuCredits,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 20,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: creditSystems.gpuCredits,
        amount: 0.01,
        oneTier: true,
        billingUnits: 5,
      }),
    ],
    freeTrial: null,
  }),

  gpuSystemPro: initProduct({
    id: "gpu-system-pro",
    entitlements: {
      gpuCredits: initEntitlement({
        allowance: 5000,
        feature: creditSystems.gpuCredits,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 100,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: creditSystems.gpuCredits,
        amount: 0.01,
        oneTier: true,
        billingUnits: 1,
      }),
    ],
    freeTrial: null,
  }),

  // Quarterly
  gpuStarterQuarter: initProduct({
    id: "gpuStarterQuarter",
    entitlements: {
      gpuCredits: initEntitlement({
        allowance: 500,
        feature: creditSystems.gpuCredits,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 20,
        billingInterval: BillingInterval.Quarter,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: creditSystems.gpuCredits,
        amount: 0.01,
        oneTier: true,
        billingUnits: 5,
      }),
    ],
    freeTrial: null,
  }),

  gpuProQuarter: initProduct({
    id: "gpuProQuarter",
    entitlements: {
      gpuCredits: initEntitlement({
        allowance: 5000,
        feature: creditSystems.gpuCredits,
      }),
    },
    prices: [
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: creditSystems.gpuCredits,
        amount: 0.01,
        oneTier: true,
        billingUnits: 1,
      }),
      initPrice({
        type: "fixed_cycle",
        amount: 1000,
        billingInterval: BillingInterval.Quarter,
      }),
    ],

    freeTrial: null,
  }),

  gpuStarterAnnual: initProduct({
    id: "gpu-starter-annual",
    entitlements: {
      gpuCredits: initEntitlement({
        allowance: 500,
        feature: creditSystems.gpuCredits,
      }),
    },
    prices: [
      initPrice({
        type: "fixed_cycle",
        amount: 200,
        billingInterval: BillingInterval.Year,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: creditSystems.gpuCredits,
        amount: 0.01,
        oneTier: true,
        billingUnits: 1,
      }),
    ],

    freeTrial: null,
  }),

  gpuProAnnual: initProduct({
    id: "gpuProAnnual",
    entitlements: {
      gpuCredits: initEntitlement({
        allowance: 5000,
        feature: creditSystems.gpuCredits,
      }),
    },
    prices: [
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: creditSystems.gpuCredits,
        amount: 0.01,
        oneTier: true,
        billingUnits: 1,
      }),
      initPrice({
        type: "fixed_cycle",
        amount: 1000,
        billingInterval: BillingInterval.Year,
      }),
    ],

    freeTrial: null,
  }),

  proratedArrearSeats: initProduct({
    id: "prorated-arrear-seats",
    entitlements: {
      seats: initEntitlement({
        feature: features.seats,
        allowance: 3,
        interval: EntInterval.Lifetime,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 20,
      }),
      initPrice({
        type: "in_arrear_prorated",
        billingInterval: BillingInterval.Month,
        feature: features.seats,
        amount: 10,
        oneTier: true,
        billingUnits: 1,
      }),
    ],

    freeTrial: null,
  }),

  proratedArrearSeatsWithReset: initProduct({
    id: "prorated-arrear-seats-with-reset",
    entitlements: {
      seats: initEntitlement({
        feature: features.seats,
        allowance: 3,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 20,
      }),
      initPrice({
        type: "in_arrear_prorated",
        billingInterval: BillingInterval.Month,
        feature: features.seats,
        amount: 10,
        oneTier: true,
        billingUnits: 1,
      }),
    ],

    freeTrial: null,
  }),
};

export const attachProducts = {
  // 1. pro1Starter
  starterGroup1: initProduct({
    id: "starterGroup1",
    group: "g1",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        interval: EntInterval.Month,
        allowance: 10,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 10,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: features.metered1,
        amount: 0.5,
      }),
    ],
    freeTrial: null,
  }),
  proGroup1: initProduct({
    id: "proGroup1",
    group: "g1",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        interval: EntInterval.Month,
        allowance: 10,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 30,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: features.metered1,
        amount: 1.0,
      }),
    ],
    freeTrial: null,
  }),
  premiumGroup1: initProduct({
    id: "premiumGroup1",
    group: "g1",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered1,
        interval: EntInterval.Month,
        allowance: 100,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 50,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: features.metered1,
        amount: 2.0,
      }),
    ],
    freeTrial: null,
  }),

  // 2. pro2Starter
  freeGroup2: initProduct({
    id: "freeGroup2",
    group: "g2",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered2,
        allowance: 10,
      }),
    },
    prices: [],
    freeTrial: null,
  }),
  starterGroup2: initProduct({
    id: "starterGroup2",
    group: "g2",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered2,
        interval: EntInterval.Month,
        allowance: 10,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 20,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: features.metered2,
        amount: 0.3,
      }),
    ],
    freeTrial: null,
  }),

  proGroup2: initProduct({
    id: "proGroup2",
    group: "g2",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered2,
        interval: EntInterval.Month,
        allowance: 10,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 40,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: features.metered2,
        amount: 0.6,
      }),
    ],
    freeTrial: null,
  }),

  premiumGroup2: initProduct({
    id: "premiumGroup2",
    group: "g2",
    entitlements: {
      metered1: initEntitlement({
        feature: features.metered2,
        interval: EntInterval.Month,
        allowance: 10,
      }),
    },
    prices: [
      initPrice({
        type: "monthly",
        amount: 60,
      }),
      initPrice({
        type: "in_arrears",
        billingInterval: BillingInterval.Month,
        feature: features.metered2,
        amount: 0.9,
      }),
    ],
    freeTrial: null,
  }),
};

// Entity products
export const entityProducts = {
  entityFree: initProduct({
    id: "entityFree",
    entitlements: {
      seats: initEntitlement({
        feature: features.seats,
        allowance: 1,
        interval: EntInterval.Lifetime,
      }),
    },
    prices: [],
    freeTrial: null,
  }),

  entityPro: initProduct({
    id: "entityPro",
    entitlements: {
      seats: initEntitlement({
        feature: features.seats,
        allowance: 0,
        interval: EntInterval.Lifetime,
        carryFromPrevious: true,
      }),
      metered1: initEntitlement({
        feature: features.metered1,
        allowance: 500,
        interval: EntInterval.Month,
        entityFeatureId: features.seats.id,
        carryFromPrevious: true,
      }),
    },
    prices: [
      // initPrice({
      //   type: "monthly",
      //   amount: 10,
      // }),
      initPrice({
        type: "in_arrear_prorated",
        billingInterval: BillingInterval.Month,
        feature: features.seats,
        amount: 100,
        oneTier: true,
        billingUnits: 1,
        // Carry over usage
      }),
    ],
    freeTrial: null,
  }),
};

export const rewards = {
  rolloverAll: initReward({
    id: "rolloverAll",
    discountValue: 1000,
    rollover: true,
    applyToAll: true,
  }),
  rolloverUsage: initReward({
    id: "rolloverUsage",
    discountValue: 1000,
    rollover: true,
    onlyUsagePrices: true,
    productIds: [products.proWithOverage.id],
  }),
  monthOff: initReward({
    id: "monthOff",
    discountType: DiscountType.Percentage,
    discountValue: 100,
    applyToAll: true,
    durationType: CouponDurationType.Months,
    durationValue: 1,
  }),
};

export const referralPrograms = {
  onCheckout: initRewardTrigger({
    id: "onCheckout",
    internalRewardId: rewards.monthOff.id,
    when: RewardTriggerEvent.Checkout,
    productIds: [products.pro.id, products.proWithTrial.id],
  }),
  immediate: initRewardTrigger({
    id: "immediate",
    internalRewardId: rewards.monthOff.id,
    when: RewardTriggerEvent.Immediately,
    // productIds: [products.pro.id, products.proWithTrial.id],
  }),
};

const ORG_SLUG = "unit-test-org";
const DEFAULT_ENV = AppEnv.Sandbox;
before(async function () {
  try {
    this.env = AppEnv.Sandbox;
    this.sb = createSupabaseClient();
    this.org = await OrgService.getBySlug({
      sb: this.sb,
      slug: ORG_SLUG,
    });

    let { data: dbFeatures, error } = await this.sb
      .from("features")
      .select("*")
      .eq("org_id", this.org.id)
      .eq("env", this.env);

    const cleanFeatures = (features: Record<string, Feature>) => {
      for (const featureId in features) {
        let feature = features[featureId as keyof typeof features];
        let dbFeature = dbFeatures.find((f: any) => f.id === feature.id);
        if (!dbFeature) {
          // throw new Error(`Feature ${feature.id} not found`);
          continue;
        }
        features[featureId as keyof typeof features].internal_id =
          dbFeature.internal_id;
        if (feature.type === FeatureType.Metered) {
          // Ignore this for now
          // @ts-ignore eventName is manually set
          features[featureId as keyof typeof features].eventName =
            dbFeature.config?.filters[0].value[0];
        }
      }
    };

    cleanFeatures(features);
    cleanFeatures(creditSystems);
  } catch (error) {
    console.error(error);
  }
});

// before(async function () {
//   console.log("Running setup");
//   this.timeout(20000);

//   this.org = await clearOrg({ orgSlug: ORG_SLUG, env: DEFAULT_ENV });
//   this.env = DEFAULT_ENV;
//   this.sb = createSupabaseClient();
//   this.stripeCli = createStripeCli({
//     org: this.org,
//     env: this.env,
//   });

//   await setupOrg({
//     orgId: this.org.id,
//     env: DEFAULT_ENV,
//     features: { ...features, ...creditSystems } as any,
//     products: { ...products, ...advanceProducts } as any,
//   });

//   this.customerId = "123";

//   console.log("--------------------------------");
// });
