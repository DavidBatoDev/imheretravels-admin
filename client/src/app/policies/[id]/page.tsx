import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PolicyDetail from "@/components/policies/PolicyDetail";

export const metadata: Metadata = {
  title: "Policy - ImHereTravels Admin",
  description: "Policy details",
};

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <DashboardLayout>
      <PolicyDetail id={id} />
    </DashboardLayout>
  );
}
