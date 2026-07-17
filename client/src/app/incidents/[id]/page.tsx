import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import IncidentDetail from "@/components/incidents/IncidentDetail";

export const metadata: Metadata = {
  title: "Incident - ImHereTravels Admin",
  description: "Incident details and report",
};

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <DashboardLayout>
      <IncidentDetail id={id} />
    </DashboardLayout>
  );
}
