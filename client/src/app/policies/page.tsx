import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PoliciesList from "@/components/policies/PoliciesList";

export const metadata: Metadata = {
  title: "Policies - ImHereTravels Admin",
  description: "Team processes, guidelines, and do's & don'ts",
};

export default function PoliciesPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-hk-grotesk">
            Policies
          </h1>
          <p className="text-muted-foreground text-lg">
            Reference the team can rely on — processes like KYC, do's & don'ts,
            and data-handling rules.
          </p>
        </div>
        <PoliciesList />
      </div>
    </DashboardLayout>
  );
}
