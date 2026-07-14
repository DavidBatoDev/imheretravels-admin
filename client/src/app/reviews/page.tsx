import { Metadata } from "next";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import PermissionGuard from "@/components/auth/PermissionGuard";
import ReviewsList from "@/components/reviews/ReviewsList";

export const metadata: Metadata = {
  title: "Tour Reviews - ImHereTravels Admin",
  description: "Moderate traveler reviews, add photos, and hide or publish reviews",
};

export default function ReviewsPage() {
  return (
    <DashboardLayout fullWidth>
      <PermissionGuard permission="canManageTours">
        <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-hk-grotesk">
              Tour Reviews
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Moderate traveler reviews, add photos, and hide or publish reviews
            </p>
          </div>
          <ReviewsList />
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
