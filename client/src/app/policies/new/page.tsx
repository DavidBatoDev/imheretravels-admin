import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import AdminGuard from "@/components/auth/AdminGuard";
import PolicyForm from "@/components/policies/PolicyForm";

export const metadata: Metadata = {
  title: "New Policy - ImHereTravels Admin",
  description: "Create a new policy",
};

export default function NewPolicyPage() {
  return (
    <DashboardLayout fullWidth>
      <AdminGuard action="create policies">
        <PolicyForm />
      </AdminGuard>
    </DashboardLayout>
  );
}
