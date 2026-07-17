import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import IncidentsList from "@/components/incidents/IncidentsList";

export const metadata: Metadata = {
  title: "Incidents - ImHereTravels Admin",
  description: "Archive of issues, incidents, and root-cause reports",
};

export default function IncidentsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-hk-grotesk">
            Incidents
          </h1>
          <p className="text-muted-foreground text-lg">
            A shared archive of issues across the app, website, and team — with
            what still needs action.
          </p>
        </div>
        <IncidentsList />
      </div>
    </DashboardLayout>
  );
}
