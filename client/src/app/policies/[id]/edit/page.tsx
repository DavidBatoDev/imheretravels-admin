import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import AdminGuard from "@/components/auth/AdminGuard";
import PolicyEditLoader from "@/components/policies/PolicyEditLoader";

export const metadata: Metadata = {
  title: "Edit Policy - ImHereTravels Admin",
  description: "Edit a policy",
};

export default async function EditPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <DashboardLayout fullWidth>
      <AdminGuard action="edit policies">
        <PolicyEditLoader id={id} />
      </AdminGuard>
    </DashboardLayout>
  );
}
