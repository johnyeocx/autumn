"use client";

import { LoaderCircle } from "lucide-react";
import React from "react";

function LoadingScreen() {
  const texts = [
    "Counting pennies",
    "Forging products", 
    "Increasing ARR",
    "Optimizing pricing",
    "Blasting competitors",
    "Shipping faster",
    "Stopping churn"
  ];
  const [loadingText, setLoadingText] = React.useState(texts[Math.floor(Math.random() * texts.length)]);

  React.useEffect(() => {
    let currentIndex = 0;

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % texts.length;
      setLoadingText(texts[currentIndex]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center flex-col gap-4">
      <LoaderCircle className="animate-spin text-primary" size={30} />
      <p className="text-primary font-medium">{loadingText}</p>
    </div>
  );
}

export default LoadingScreen;
