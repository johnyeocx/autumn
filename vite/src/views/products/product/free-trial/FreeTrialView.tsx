import { CreateFreeTrial } from "./CreateFreeTrial";
import { EditFreeTrialToolbar } from "./EditFreeTrialToolbar";

export const FreeTrialView = ({ product }: { product: any }) => {
  return (
    <>
      {product.free_trial && (
        <>
          <div className="flex justify-between gap-4 rounded-sm w-full">
            <div className="flex flex-col w-full gap-2">
              <div className="flex items-center w-full justify-between h-4">
                <p className="text-xs text-t3 font-medium text-center">
                  Length{" "}
                </p>
                <p className="text-xs text-t2 ">
                  {product.free_trial.length} days
                </p>
              </div>
              <div className="flex items-center w-full justify-between h-4">
                <p className="text-xs text-t3 font-medium text-center">
                  Limit by Fingerprint
                </p>
                <p className="text-xs text-t2 ">
                  {product.free_trial.unique_fingerprint ? (
                    <span className="text-lime-600">True</span>
                  ) : (
                    "False"
                  )}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
      {/* {!product.free_trial && <CreateFreeTrial />} */}
    </>
  );
};
