"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import PolicyForm from "@/components/policies/PolicyForm";
import { getPolicyById } from "@/services/policies-service";
import type { Policy } from "@/types/policies";

/** Fetches a policy by id, then renders the edit form. */
export default function PolicyEditLoader({ id }: { id: string }) {
  const router = useRouter();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    getPolicyById(id)
      .then((d) => {
        if (!active) return;
        if (!d) setNotFound(true);
        else setPolicy(d);
      })
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-crimson-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !policy) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Policy not found
        </h1>
        <Button onClick={() => router.push("/policies")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to policies
        </Button>
      </div>
    );
  }

  return <PolicyForm policy={policy} />;
}
