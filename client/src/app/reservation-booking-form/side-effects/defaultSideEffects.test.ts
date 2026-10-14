import { describe, expect, it, vi } from "vitest";
import { createDefaultReservationSideEffects } from "./defaultSideEffects";

describe("defaultSideEffects", () => {
  it("replaces url with payment id via router and history fallback", () => {
    const replace = vi.fn();
    const replaceStateSpy = vi.fn();

    (globalThis as any).window = {
      history: {
        state: null,
        replaceState: replaceStateSpy,
      },
      location: {
        reload: vi.fn(),
      },
      alert: vi.fn(),
    };

    const effects = createDefaultReservationSideEffects({
      router: { replace },
    });

    effects.navigation.replaceWithPaymentId(
      "/reservation-booking-form",
      "pid-1",
    );

    expect(replace).toHaveBeenCalledWith(
      "/reservation-booking-form?paymentid=pid-1",
    );
    expect(replaceStateSpy).toHaveBeenCalled();
  });
});
