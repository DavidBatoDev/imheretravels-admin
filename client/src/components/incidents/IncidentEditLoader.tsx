"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import IncidentForm from "@/components/incidents/IncidentForm";
import { getIncidentById } from "@/services/incidents-service";
import type { Incident } from "@/types/incidents";

/** Fetches an incident by id, then renders the edit form. */
export default function IncidentEditLoader({ id }: { id: string }) {
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    getIncidentById(id)
      .then((d) => {
        if (!active) return;
        if (!d) setNotFound(true);
        else setIncident(d);
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

  if (notFound || !incident) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Incident not found
        </h1>
        <Button onClick={() => router.push("/incidents")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to incidents
        </Button>
      </div>
    );
  }

  return <IncidentForm incident={incident} />;
}
