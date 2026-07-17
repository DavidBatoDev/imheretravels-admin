import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PermissionGuard from "@/components/auth/PermissionGuard";
import DestinationsList from "@/components/destinations/DestinationsList";

export const metadata: Metadata = {
  title: "Destinations - ImHereTravels Admin",
  description: "Manage destination landing pages and their linked tours",
};

export default function DestinationsPage() {
  return (
    <DashboardLayout>
      <PermissionGuard permission="canManageTours">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-hk-grotesk">
              Destinations
            </h1>
            <p className="text-muted-foreground text-lg">
              Manage destination landing pages and their linked tours
            </p>
          </div>
          <DestinationsList />
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
