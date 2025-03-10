import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import React from "react";

function CustomerBalances({ customer }: { customer: any }) {
  if (!customer) {
    return <div></div>;
  }

  if (!customer.entitlements || customer.entitlements.length === 0) {
    return (
      <div className="text-sm text-gray-600">
        Nothing (make a payment to change that!)
      </div>
    );
  }

  return (
    <div className="flex gap-4 flex-wrap">
      {customer.entitlements.map((entitlement) => (
        <div
          key={entitlement.feature_id}
          className="flex flex-col justify-between w-36 gap-3 border bg-white p-4 rounded-md"
        >
          {/* <div> */}
          <p className="text-sm font-medium text-gray-600">
            {keyToTitle(entitlement.feature_id)}
          </p>
          <p className="text-lg font-bold text-t2/90">
            {entitlement.unlimited === true
              ? "Unlimited"
              : entitlement.balance !== undefined
              ? // ? entitlement.balance + entitlement.used === 0
                entitlement.balance < 0
                ? `Used: ${-entitlement.balance}`
                : `${entitlement.balance} / ${
                    entitlement.balance + entitlement.used
                  }`
              : "✅"}
            {/* {entitlement.balance == null
              ? "✅"
              : `${entitlement.balance} / ${
                  entitlement.balance + entitlement.used
                }` || "Allowed"} */}
          </p>
        </div>
      ))}
    </div>
  );
}

export default CustomerBalances;
