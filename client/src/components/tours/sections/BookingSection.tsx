"use client";

import React from "react";
import { UseFormReturn } from "react-hook-form";
import { CreditCard, Calendar, Route } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import SectionWrapper from "../shared/SectionWrapper";

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "£", GBP: "£" };

interface BookingSectionProps {
   
  form: UseFormReturn<any>;
}

export default function BookingSection({ form }: BookingSectionProps) {
  const pricing = form.watch("pricing");
  const duration = form.watch("duration") as string | undefined;
  const route = form.watch("details.route") as string | undefined;
  const depositNote = form.watch("depositNote") as string | undefined;
  const footnote = form.watch("footnote") as string | undefined;
  const stripePaymentLink = form.watch("stripePaymentLink") as string | undefined;

  const currencySymbol = CURRENCY_SYMBOLS[pricing?.currency ?? "GBP"] ?? "£";
  const displayPrice = pricing?.discounted
    ? `${currencySymbol}${Number(pricing.discounted).toLocaleString()}`
    : pricing?.original
    ? `${currencySymbol}${Number(pricing.original).toLocaleString()}`
    : null;
  const depositAmount = pricing?.deposit
    ? `${currencySymbol}${Number(pricing.deposit).toLocaleString()}`
    : null;

  const durationLabel = duration
    ? duration.replace(/\b(\d+)\s+days?\b/gi, "$1 Day Tour")
    : "";

  return (
    <SectionWrapper
      id="booking"
      title="Booking Card"
      description="Price, duration, and deposit copy shown in the sticky booking card on the tour page."
    >
      <div className="space-y-8">
        {/* Live BookingCard preview */}
        <div className="rounded-[16px] overflow-hidden bg-white shadow-medium border border-light-grey">
          {/* Duration + route header */}
          <div className="px-6 pb-4 pt-5">
            <p className="font-sans text-h5-mobile font-bold text-midnight">
              {durationLabel || "11 Day Tour"}
            </p>
            {route && (
              <p className="mt-1 font-body text-b2-mobile text-dark-gray">{route}</p>
            )}
          </div>

          {/* Price row */}
          <div className="border-t border-light-grey px-6 py-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-body text-b4-desktop text-dark-gray">From</span>
              <span className="font-body text-b4-desktop text-dark-gray">
                {currencySymbol}
              </span>
              <span className="font-display text-h3-mobile text-midnight leading-none">
                {displayPrice ? displayPrice.replace(/^[£$£]/, "") : "—"}
              </span>
            </div>
          </div>

          {/* Icon facts */}
          <div className="px-6 pb-4">
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-light-grey">
                  <Calendar className="h-4 w-4 text-midnight" />
                </span>
                <span className="font-body text-b4-desktop text-midnight">
                  {durationLabel || "—"}
                </span>
              </li>
              {route && (
                <li className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-light-grey">
                    <Route className="h-4 w-4 text-midnight" />
                  </span>
                  <span className="font-body text-b4-desktop text-midnight">{route}</span>
                </li>
              )}
            </ul>
          </div>

          {/* CTA + deposit */}
          <div className="border-t border-light-grey px-6 py-5">
            <div className="inline-flex w-full items-center justify-center rounded-full bg-crimson-red px-6 py-3.5 font-body font-bold text-white shadow-small">
              Reserve Now
            </div>
            {(depositNote || depositAmount) && (
              <p className="mt-4 text-center font-body text-b4-mobile text-dark-gray">
                {depositNote ||
                  (depositAmount
                    ? `Reserve for ${depositAmount} — deducted from total fees. Non-refundable.`
                    : "")}
              </p>
            )}
            {footnote && (
              <p className="mt-3 text-center font-body text-b4-mobile text-grey">
                *{footnote}
              </p>
            )}
          </div>
        </div>

        {/* Editable pricing fields */}
        <div className="space-y-5">
          <p className="font-sans font-bold text-midnight text-sm border-b border-light-grey pb-2">
            Pricing
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="pricing.currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans font-bold text-midnight">Currency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="border-2 border-border focus:border-crimson-red">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (£)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pricing.original"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans font-bold text-midnight">Price</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 2150"
                      {...field}
                      value={field.value ?? ""}
                      className="border-2 border-border focus:border-crimson-red"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pricing.discounted"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans font-bold text-midnight">Discounted</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="Optional"
                      {...field}
                      value={field.value ?? ""}
                      className="border-2 border-border focus:border-crimson-red"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pricing.deposit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-sans font-bold text-midnight flex items-center gap-1">
                    <CreditCard className="h-3.5 w-3.5 text-crimson-red" />
                    Deposit
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 300"
                      {...field}
                      value={field.value ?? ""}
                      className="border-2 border-border focus:border-crimson-red"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <p className="font-sans font-bold text-midnight text-sm border-b border-light-grey pb-2 pt-2">
            Booking Copy
          </p>

          <FormField
            control={form.control}
            name="stripePaymentLink"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans font-bold text-midnight">Stripe Payment Link</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://book.stripe.com/..."
                    {...field}
                    value={field.value ?? ""}
                    className="border-2 border-border focus:border-crimson-red"
                  />
                </FormControl>
                <FormDescription className="font-body text-b4-desktop text-dark-gray">
                  The booking CTA button href on the tour page. Leave blank to
                  send travellers to the in-house reservation booking form
                  (admin.imheretravels.com/reservation-booking-form) with this
                  tour pre-selected.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="depositNote"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans font-bold text-midnight">Deposit Notice</FormLabel>
                <FormControl>
                  <Input
                    placeholder={`Reserve for ${depositAmount ?? "£300"} — deducted from total fees. Non-refundable.`}
                    {...field}
                    value={field.value ?? ""}
                    className="border-2 border-border focus:border-crimson-red"
                  />
                </FormControl>
                <FormDescription className="font-body text-b4-desktop text-dark-gray">
                  Leave blank to auto-generate from the deposit amount above.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="footnote"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-sans font-bold text-midnight">Footnote</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Additional fees may apply"
                    {...field}
                    value={field.value ?? ""}
                    className="border-2 border-border focus:border-crimson-red"
                  />
                </FormControl>
                <FormDescription className="font-body text-b4-desktop text-dark-gray">
                  Shown below the CTA with a * prefix. Leave blank to hide.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </SectionWrapper>
  );
}
