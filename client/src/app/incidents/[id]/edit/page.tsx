import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import AdminGuard from "@/components/auth/AdminGuard";
import IncidentEditLoader from "@/components/incidents/IncidentEditLoader";

export const metadata: Metadata = {
  title: "Edit Incident - ImHereTravels Admin",
  description: "Edit an incident",
};

export default async function EditIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <DashboardLayout fullWidth>
      <AdminGuard action="edit incidents">
        <IncidentEditLoader id={id} />
      </AdminGuard>
    </DashboardLayout>
  );
}
