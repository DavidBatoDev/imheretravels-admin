import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import AdminGuard from "@/components/auth/AdminGuard";
import IncidentForm from "@/components/incidents/IncidentForm";

export const metadata: Metadata = {
  title: "New Incident - ImHereTravels Admin",
  description: "Log a new incident",
};

export default function NewIncidentPage() {
  return (
    <DashboardLayout fullWidth>
      <AdminGuard action="create incidents">
        <IncidentForm />
      </AdminGuard>
    </DashboardLayout>
  );
}
