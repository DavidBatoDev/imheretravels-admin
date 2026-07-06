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
    <DashboardLayout>
      <PermissionGuard permission="canManageTours">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-hk-grotesk">
              Tour Reviews
            </h1>
            <p className="text-muted-foreground text-lg">
              Moderate traveler reviews, add photos, and hide or publish reviews
            </p>
          </div>
          <ReviewsList />
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
