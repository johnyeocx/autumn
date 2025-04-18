import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { PricingConfig, validateConfig } from "./PricingConfig";
import { CreatePriceSchema, PriceType } from "@autumn/shared";
import { useProductContext } from "../ProductContext";

export const CreatePrice = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState<any>(null);

  const { product, setProduct, selectedEntitlementAllowance } =
    useProductContext();

  const handleCreatePrice = async () => {
    if (!price) {
      return;
    }

    setLoading(true);
    const config = validateConfig(price, product.prices);

    if (!config) {
      return;
    }

    const newPrice = CreatePriceSchema.parse({
      name: price.name,
      config,
    });

    setProduct({
      ...product,
      prices: [...product.prices, newPrice],
    });
    setOpen(false);
    setPrice(null);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="dashed"
          className="w-full"
          startIcon={<PlusIcon size={15} />}
        >
          Create Price
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Create Price</DialogTitle>
        <PricingConfig priceConfig={price} setPriceConfig={setPrice} />
        <DialogFooter>
          <Button
            onClick={handleCreatePrice}
            isLoading={loading}
            variant="gradientPrimary"
            disabled={selectedEntitlementAllowance === "unlimited"}
          >
            Create Price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
