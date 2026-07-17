"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PermissionGuard from "@/components/auth/PermissionGuard";
import DestinationForm from "@/components/destinations/DestinationForm";
import {
  getDestinationById,
  updateDestination,
} from "@/services/destinations-service";
import { Destination, DestinationFormData } from "@/types/destinations";

export default function EditDestinationPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const destinationId = params?.destinationId as string;

  const [destination, setDestination] = useState<Destination | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    if (!destinationId) return;
    getDestinationById(destinationId)
      .then((data) => setDestination(data))
      .catch(() => {
        toast({
          title: "Error",
          description: "Failed to load destination data.",
          variant: "destructive",
        });
      })
      .finally(() => setIsFetching(false));
  }, [destinationId]);

  const handleSubmit = async (data: DestinationFormData): Promise<void> => {
    await updateDestination(destinationId, data);
  };

  return (
    <DashboardLayout fullWidth>
      <PermissionGuard permission="canManageTours">
        <DestinationForm
          onClose={() => router.push("/destinations")}
          onSubmit={handleSubmit}
          destination={destination}
          isLoading={isFetching}
        />
      </PermissionGuard>
    </DashboardLayout>
  );
}
