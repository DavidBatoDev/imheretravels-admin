"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ToursList from "./ToursList";
import DiscountedToursTab from "@/app/tours/DiscountedToursTab";

const urlToInternalTab = (urlTab: string | null): string => {
  switch (urlTab) {
    case "packages":
      return "packages";
    case "hosted":
      return "hosted";
    case "discounted":
      return "discounted";
    default:
      return "packages";
  }
};

const internalTabToUrl = (internalTab: string): string => {
  switch (internalTab) {
    case "packages":
      return "packages";
    case "hosted":
      return "hosted";
    case "discounted":
      return "discounted";
    default:
      return "packages";
  }
};

export default function ToursTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("packages");

  useEffect(() => {
    const urlTab = searchParams?.get("tab") ?? null;
    const initial = urlToInternalTab(urlTab);
    setActiveTab(initial);
    if (!urlTab || urlTab !== internalTabToUrl(initial)) {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      sp.set("tab", internalTabToUrl(initial));
      router.replace(`/tours?${sp.toString()}`);
    }
  }, [searchParams, router]);

  const onChange = (val: string) => {
    setActiveTab(val);
    const sp = new URLSearchParams(searchParams?.toString() ?? "");
    sp.set("tab", internalTabToUrl(val));
    router.push(`/tours?${sp.toString()}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground font-hk-grotesk">Tour Packages</h1>
        <p className="text-muted-foreground text-lg">Manage tour packages and itineraries</p>
      </div>

      <Tabs value={activeTab} onValueChange={onChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted border border-border">
          <TabsTrigger
            value="packages"
            className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow transition-all duration-200"
          >
            Tours
          </TabsTrigger>
          <TabsTrigger
            value="hosted"
            className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow transition-all duration-200"
          >
            Hosted Tours
          </TabsTrigger>
          <TabsTrigger
            value="discounted"
            className="data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow transition-all duration-200"
          >
            Discounted Tours
          </TabsTrigger>
        </TabsList>

        <TabsContent value="packages" className="mt-6">
          <ToursList view="regular" />
        </TabsContent>

        <TabsContent value="hosted" className="mt-6">
          <ToursList view="hosted" />
        </TabsContent>

        <TabsContent value="discounted" className="mt-6">
          <DiscountedToursTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
