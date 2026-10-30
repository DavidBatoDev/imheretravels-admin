"use client";

import { Lock } from "lucide-react";
import { formatGBP } from "../sale-utils";
import type { PreviewSlot } from "./sale-draft";

// Read-only copies of the fixed sections of the www sale page, so the editor
// reads end to end. Source of truth: www/app/black-friday/_components/
// HowItWorks.tsx and saleFaqs.ts. Update both together.

function saleFaqs(holdMinutes: number): { q: string; a: string }[] {
  return [
    {
      q: "How do slots work?",
      a: "Each tour in the sale has a small number of discounted slots, sold in order. Slot 1 is the cheapest, slot 2 costs a little more, and so on. When you book, your party takes the next free slots — a Duo booking after slot 1 has gone gets slots 2 and 3.",
    },
    {
      q: "Why do earlier slots cost less?",
      a: "It's our way of thanking the travellers who commit first. The earlier slots carry the biggest discounts, so the sooner you book, the more you save. Every slot is still cheaper than the tour's normal price.",
    },
    {
      q: "What happens when I hold a slot?",
      a: `We keep your slots for you for ${holdMinutes} minutes while you finish booking. Only you see the timer — everyone else just sees those slots as "on hold". If you don't finish in time, they go back on sale.`,
    },
    { q: "Can I pick my travel date?", a: "Yes. You choose your date in the next step, from any available date of that tour." },
    {
      q: "What do I pay today?",
      a: "Just the tour's reservation fee for each person in your party. The rest of the sale price is paid in instalments before you travel.",
    },
    {
      q: "Is it refundable?",
      a: "No. Black Friday bookings are non-refundable, as set out in our Terms & Conditions. Please make sure of your plans before you book.",
    },
    {
      q: "What if the timer runs out?",
      a: "Your slots are released and go back on sale for everyone. If they're still free, you can hold them again — but the price is whatever the next free slot costs at that moment.",
    },
  ];
}

function FixedNote() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-gray/40 bg-white px-3 py-1 font-body text-xs font-bold text-dark-gray">
      <Lock className="h-3 w-3" aria-hidden />
      Fixed content · not editable here
    </span>
  );
}

export default function SaleFixedContent({
  part,
  holdMinutes,
  example,
}: {
  /** "how" renders How it works (2nd on the page), "faq" the Sale FAQs (last), as on www. */
  part: "how" | "faq";
  holdMinutes: number;
  example?: { name: string; originalPrice: number; slots: PreviewSlot[] };
}) {
  const steps = [
    { title: "Pick a tour", body: "Choose Solo, Duo or a group. Your party takes the next free slots in order." },
    {
      title: `Hold your slots for ${holdMinutes} min`,
      body: "Enter your email and we keep them just for you while you book. Only you see the timer.",
    },
    {
      title: "Pay the reservation fee",
      body: "Choose your travel date and pay the reservation fee. The rest is paid in instalments at the sale price.",
    },
  ];
  const exampleSlots = example?.slots.filter((s) => s.salePrice !== null) ?? [];

  return (
    <>
      {part === "how" && (
        <>
      <section aria-labelledby="fixed-how" className="overflow-hidden rounded-[24px] bg-white shadow-medium">
        <div className="px-5 py-8 opacity-80 md:px-8 md:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="fixed-how" className="font-display text-h2-mobile text-midnight md:text-h2-desktop">
              How it works
            </h2>
            <FixedNote />
          </div>
          <ol className="mt-8 grid gap-6 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4 md:flex-col md:gap-3">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-crimson-red font-sans text-h6-mobile text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-sans text-h6-mobile text-midnight md:text-h6-desktop">{s.title}</h3>
                  <p className="mt-1 font-body text-b2-mobile text-dark-gray md:text-b4-desktop">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-10 rounded-lg bg-light-grey p-5 md:flex md:items-center md:justify-between md:gap-10 md:p-7">
            <div className="md:max-w-sm">
              <p className="font-sans text-h5-mobile text-midnight md:text-h5-desktop">Earlier slots = bigger savings</p>
              <p className="mt-1 font-body text-b2-mobile text-dark-gray md:text-b4-desktop">
                Slot 1 is the cheapest. Each slot after it costs a little more, so the sooner you book, the more you save.
              </p>
            </div>
            {example && exampleSlots.length > 1 && (
              <figure className="mt-5 md:mt-0 md:flex-1">
                <ol className="flex items-end gap-1.5 tabular-nums" aria-label={`${example.name} slot prices`}>
                  {/* Same cap as www HowItWorks: first 5 bars, then "+N more". */}
                  {exampleSlots.slice(0, 5).map((s, i) => (
                    <li
                      key={s.index}
                      className={`flex flex-1 flex-col justify-end rounded-sm px-2 pb-2 ${i === 0 ? "bg-crimson-red text-white" : "bg-white text-midnight"}`}
                      style={{ minHeight: `${56 + i * 14}px` }}
                    >
                      <span className="font-body text-[0.75rem] font-medium">Slot {s.index}</span>
                      <span className="font-body text-[0.875rem] font-bold">{formatGBP(s.salePrice ?? 0)}</span>
                    </li>
                  ))}
                  {exampleSlots.length > 5 && (
                    <li className="flex flex-col items-center justify-end rounded-sm border-2 border-dashed border-dark-gray/40 px-2 pb-2 text-midnight" style={{ minHeight: "112px" }}>
                      <span className="font-body text-[0.875rem] font-bold">+{exampleSlots.length - 5}</span>
                      <span className="font-body text-[0.75rem] font-medium">more</span>
                    </li>
                  )}
                </ol>
                <figcaption className="mt-2 font-body text-b4-mobile text-dark-gray md:text-b4-desktop">
                  {example.name}, usually {formatGBP(example.originalPrice)} per person. (Uses the first deal.)
                </figcaption>
              </figure>
            )}
          </div>
        </div>
      </section>

        </>
      )}
      {part === "faq" && (
        <>
      <section aria-labelledby="fixed-faq" className="overflow-hidden rounded-[24px] bg-white shadow-medium">
        <div className="px-5 py-8 opacity-80 md:px-8 md:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="fixed-faq" className="font-display text-h2-mobile text-midnight md:text-h2-desktop">
              Sale FAQs
            </h2>
            <FixedNote />
          </div>
          <div className="mt-6 divide-y divide-light-grey rounded-lg border border-light-grey px-5">
            {saleFaqs(holdMinutes).map((f, i) => (
              <details key={f.q} open={i === 0} className="group py-4">
                <summary className="cursor-pointer list-none font-sans text-b2-mobile font-bold text-midnight marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson-red md:text-b2-desktop">
                  <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
                    ›
                  </span>
                  {f.q}
                </summary>
                <p className="mt-2 pl-5 font-body text-b4-desktop text-dark-gray">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 font-body text-b4-desktop text-dark-gray">
            Black Friday bookings are non-refundable. Full details in our Terms &amp; Conditions. Questions? Contact us.
          </p>
        </div>
      </section>
        </>
      )}
    </>
  );
}
