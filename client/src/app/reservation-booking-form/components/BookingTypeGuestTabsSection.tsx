import Select from "./Select";
import { AnimatePresence, motion } from "framer-motion";

type BookingTypeOption = {
  label: string;
  value: string;
  disabled?: boolean;
  description?: string;
};

type BookingTypeGuestTabsSectionProps = {
  bookingType: string;
  onBookingTypeChange: (value: string) => void;
  bookingTypeOptions: BookingTypeOption[];
  paymentConfirmed: boolean;
  errors: { [k: string]: string };
  showValidationFeedback: boolean;
  groupSize: number;
  onGroupSizeChange: (value: number) => void;
  activeGuestTab: number;
  onActiveGuestTabChange: (tab: number) => void;
  selectedPackageName?: string;
  tourDate: string;
};

export default function BookingTypeGuestTabsSection({
  bookingType,
  onBookingTypeChange,
  bookingTypeOptions,
  paymentConfirmed,
  errors,
  showValidationFeedback,
  groupSize,
  onGroupSizeChange,
  activeGuestTab,
  onActiveGuestTabChange,
  selectedPackageName,
  tourDate,
}: BookingTypeGuestTabsSectionProps) {
  const showGuestTabs =
    bookingType === "Duo Booking" || bookingType === "Group Booking";

  return (
    <div className="border-border/30">
      <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-border/50">
        <div className="p-4 bg-primary rounded-full rounded-br-none">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-foreground">
          Personal & Reservation details
        </h3>
      </div>

      <div className="mb-8">
        <label className="block">
          <span className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
            Booking type
            <span className="text-destructive text-xs">*</span>
          </span>
          <Select
            value={bookingType}
            onChange={(v) => onBookingTypeChange(v)}
            options={bookingTypeOptions}
            placeholder="Select booking type"
            ariaLabel="Booking Type"
            className="mt-1"
            disabled={paymentConfirmed}
            isValid={
              showValidationFeedback && !!bookingType && !errors.bookingType
            }
          />
          {errors.bookingType && (
            <p className="mt-2 text-xs text-destructive flex items-center gap-1 animate-in fade-in slide-in-from-top-2 duration-300">
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {errors.bookingType}
            </p>
          )}
        </label>

        <AnimatePresence initial={false}>
          {bookingType === "Group Booking" && (
            <motion.div
              key="group-size-panel"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="mt-2 overflow-hidden"
            >
              <div className="p-3 rounded-lg bg-gradient-to-r from-card/50 to-card/80 border border-border shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-3">
                    <svg
                      className="w-5 h-5 text-primary flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span>Group size (including you)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Decrease group size"
                      onClick={() => onGroupSizeChange(groupSize - 1)}
                      className="h-11 w-11 rounded-full bg-gradient-to-br from-crimson-red to-crimson-red/80 text-white flex items-center justify-center hover:scale-110 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-crimson-red focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-md transition-all duration-300 ease-out"
                      disabled={paymentConfirmed || groupSize <= 3}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M20 12H4"
                        />
                      </svg>
                    </button>

                    <div className="px-7 py-3 min-w-[5.5rem] text-center rounded-lg bg-background border-2 border-primary/20 shadow-inner transition-all duration-300">
                      <span className="text-xl font-bold text-foreground tabular-nums">
                        {groupSize}
                      </span>
                    </div>

                    <button
                      type="button"
                      aria-label="Increase group size"
                      onClick={() => onGroupSizeChange(groupSize + 1)}
                      className="h-11 w-11 rounded-full bg-gradient-to-br from-crimson-red to-crimson-red/80 text-white flex items-center justify-center hover:scale-110 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-crimson-red focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-md transition-all duration-300 ease-out"
                      disabled={paymentConfirmed || groupSize >= 20}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-muted-foreground/70 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    You'll provide details for all{" "}
                    <strong className="text-foreground">{groupSize} guests</strong>{" "}
                    below
                  </span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {showGuestTabs && (
          <motion.div
            key={`guest-tabs-${bookingType}`}
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="mb-8 overflow-hidden"
          >
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <button
                type="button"
                onClick={() => onActiveGuestTabChange(1)}
                className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all duration-300 ease-in-out ${
                  activeGuestTab === 1
                    ? "bg-crimson-red text-white shadow-md"
                    : "bg-card border border-border text-foreground hover:border-crimson-red/50"
                }`}
              >
                Guest 1 (YOU)
              </button>

              {Array.from({
                length: bookingType === "Duo Booking" ? 1 : groupSize - 1,
              }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onActiveGuestTabChange(idx + 2)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all duration-300 ease-in-out ${
                    activeGuestTab === idx + 2
                      ? "bg-crimson-red text-white shadow-md"
                      : "bg-card border border-border text-foreground hover:border-crimson-red/50"
                  }`}
                >
                  Guest {idx + 2}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
              <svg
                className="w-4 h-4 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                Fill in details for each guest. All guests will be booked for{" "}
                <strong>{selectedPackageName || "the selected tour"}</strong> on{" "}
                <strong>{tourDate || "the selected date"}</strong>.
              </span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
