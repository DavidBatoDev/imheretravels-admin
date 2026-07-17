"use client";

import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PermissionGuard from "@/components/auth/PermissionGuard";
import DestinationForm from "@/components/destinations/DestinationForm";
import { createDestination } from "@/services/destinations-service";
import { DestinationFormData } from "@/types/destinations";

export default function NewDestinationPage() {
  const router = useRouter();

  const handleSubmit = async (data: DestinationFormData): Promise<string> => {
    return await createDestination(data);
  };

  return (
    <DashboardLayout fullWidth>
      <PermissionGuard permission="canManageTours">
        <DestinationForm
          onClose={() => router.push("/destinations")}
          onSubmit={handleSubmit}
        />
      </PermissionGuard>
    </DashboardLayout>
  );
}
