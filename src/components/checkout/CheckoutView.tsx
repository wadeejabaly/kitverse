"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { GIFT_BOX_MAX_QTY, GIFT_BOX_PRICE, SHIPPING_ILS_BY_TIER, SHIPPING_LABEL_BY_TIER, accessoryDeals, cartTotals, priceLine, round2 } from "@/data/pricing";
import { accessoryLabel } from "@/components/shop/accessoryLabel";
import { PATCH_PROP_KEYS } from "@/data/patches";
import { lineKey, useCart } from "@/components/cart/CartProvider";
import type { CartAccessoryInfo, CartProductInfo } from "@/components/cart/CartView";
import { Figure, Price } from "@/components/shared/Money";
import { CustomerSchema, type CheckoutErrorCode } from "@/lib/checkout";
import { CityCombobox } from "@/components/checkout/CityCombobox";
import type { TownOption } from "@/data/localities";
import { trackCheckoutStart } from "@/lib/analytics/track";
import { BitMark } from "@/components/checkout/BitMark";
import type { ManualMethod } from "@/lib/manual-pay-core";

/**
 * Checkout.
 *
 * Everything on this screen is a display of something the server will decide
 * for itself. The line prices and the total are recomputed here from
 * pricing.ts purely so the customer can see what they are agreeing to; the
 * request that goes to /api/checkout/create-order carries the cart's CHOICES
 * — handle, size, version, personalisation, quantity — and no money at all.
 * The server re-derives the amount from the catalogue and charges that.
 *
 * Every payment control is visible from the start, not revealed once the form
 * validates — a shopper should see the "Send order" button before they begin
 * typing, so they know what is coming. It is simply disabled (the same grey
 * .btn:disabled treatment every other control on the site uses) until the
 * delivery form validates, and reads as active the moment it does. A buyer who
 * pays and only then discovers their address was rejected would have been
 * failed by the page, so disabled still means disabled underneath, not just
 * visually — the onClick handlers run only once `parsed.success` is true.
 *
 * Three methods, each shown only when it is configured: PayPlus clears cards
 * (a redirect to a page PayPlus hosts), PayPal covers everything else, and
 * cash on delivery (owner decision 2026-10-23: plain, no deposit — the buyer
 * pays the courier in full on arrival). With none configured the page still
 * renders in full and shows the demo panel where the payment controls would
 * be.
 *
 * The gift-box add-on (owner decision 2026-10-23) lives only here, at
 * checkout, not on the cart page: one box per order at most, but
 * quantity-selectable, because a single box can hold more than one shirt.
 *
 * Accessories (keychains, scarves): really ordered since 2026-11-10 (owner
 * request) - orderRequestBody() sends each one's handle and quantity, and the
 * server prices them from the price list (per-order add-ons 'keychain' /
 * 'scarf', with the scarf's "₪40 with a shirt" deal) with the same engine as
 * everything else. An accessories-only order is allowed.
 */

type FormValues = {
  name: string;
  phone: string;
  email: string;
  street: string;
  houseNumber: string;
  city: string;
  notes: string;
};

const EMPTY_FORM: FormValues = {
  name: "",
  phone: "",
  email: "",
  street: "",
  houseNumber: "",
  city: "",
  notes: "",
};

type FieldName = keyof FormValues;

const ERROR_CODES: readonly CheckoutErrorCode[] = [
  "invalid_request",
  "cart_empty",
  "unknown_city",
  "invalid_discount_code",
  "payments_unconfigured",
  "paypal_failed",
  "payplus_failed",
  "order_not_found",
  "capture_failed",
  "rate_limited",
  "server_error",
];

/** Mirrors the cap in src/lib/checkout.ts's CreateOrderRequestSchema. */
const MAX_DISCOUNT_CODES = 5;

/** A code the shopper has typed and the server confirmed exists (checked
 *  against POST /api/checkout/discount/check, never computed client-side).
 *  One that checks out but doesn't yet meet its own minimum order stays in
 *  this list rather than being dropped, so it kicks in on its own the
 *  moment the cart grows enough — see discountQualifies below. */
type AppliedDiscount = { code: string; kind: "percent" | "fixed"; value: number; minOrder: number; stackable: boolean; firstOrderOnly: boolean };

/** What the discount-code input is doing right now. */
type DiscountCheck =
  | { status: "idle" }
  | { status: "checking" }
  // Owner feature 2026-10-26: a non-stackable code can only be used alone —
  // the same rule the server enforces (src/lib/discounts.ts codesCanCombine).
  | { status: "invalid"; reason: "not_found" | "not_stackable" };

/** What the city field currently shows, resolved against the server's town → zone list
 *  (POST /api/checkout/resolve-city) — never guessed client-side. */
type CityCheck =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; fee: number; label: string }
  | { status: "unknown" };

function isErrorCode(value: unknown): value is CheckoutErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/** What the hosted card page sent us back with, if anything. */
type ReturnState = "failed" | "cancelled" | "pending";

function isReturnState(value: unknown): value is ReturnState {
  return value === "failed" || value === "cancelled" || value === "pending";
}

export function CheckoutView({
  products,
  accessories,
  locale,
  cashEnabled,
  paypalEnabled,
  bitEnabled,
}: {
  products: CartProductInfo[];
  accessories: CartAccessoryInfo[];
  locale: string;
  cashEnabled: boolean;
  paypalEnabled: boolean;
  bitEnabled: boolean;
}) {
  const t = useTranslations("checkout");
  const tCart = useTranslations("cart");
  const tCommon = useTranslations("common");
  const tProduct = useTranslations("product");
  const tAccessories = useTranslations("accessories");
  const router = useRouter();
  const { items, hydrated, clear } = useCart();
  const searchParams = useSearchParams();

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [phase, setPhase] = useState<
    "form" | "paying" | "redirecting" | "placing" | "done"
  >("form");
  const [errorCode, setErrorCode] = useState<CheckoutErrorCode | null>(null);
  // Why a discount code was refused when the order was sent (e.g. "first_order_only").
  const [errorReason, setErrorReason] = useState<string | null>(null);
  // The gift-box add-on (owner decision 2026-10-23): a per-ORDER quantity,
  // not a per-shirt flag — 0 means no box at all.
  const [giftBoxQty, setGiftBoxQty] = useState(0);

  // Discount codes (owner feature 2026-10-26): typed and checked here purely
  // as a preview, same posture as the city check below — the order itself is
  // always re-validated, re-priced, and re-checked for stacking server-side
  // (src/lib/orders/web.ts), which never trusts what this preview said.
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscounts, setAppliedDiscounts] = useState<AppliedDiscount[]>([]);
  const [discountCheck, setDiscountCheck] = useState<DiscountCheck>({ status: "idle" });

  // Admin stats "checkout starts" (owner request 2026-11-03): reaching this page, once per
  // mount - not once per keystroke/re-render, which is why this is its own effect with an
  // empty dep array rather than folded into anything above.
  useEffect(() => {
    trackCheckoutStart();
  }, []);

  // Personal Bit / PayPal.Me (owner requests 2026-11-10): switched on and off in admin Settings
  // without a deploy, so this static page asks the server which ones are live right now.
  const [manualMethods, setManualMethods] = useState<{ bitPersonal: boolean; paypalMe: boolean }>({ bitPersonal: false, paypalMe: false });
  useEffect(() => {
    let live = true;
    fetch("/api/checkout/manual/methods", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { bitPersonal?: unknown; paypalMe?: unknown } | null) => {
        if (live && d) setManualMethods({ bitPersonal: d.bitPersonal === true, paypalMe: d.paypalMe === true });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // One id per visit to this page: a double click or a retry of the same checkout returns the
  // order it already created instead of a second one (payments_manual_attempt unique index).
  const attemptId = useRef<string | null>(null);

  /**
   * Owner decision 2026-10-25: no region picker — the shopper just types
   * their city, and this resolves it against the same town → zone list the
   * Instagram bot uses (POST /api/checkout/resolve-city), debounced so it
   * doesn't fire on every keystroke. The server re-resolves it again at
   * order creation — this is only a preview.
   */
  const [cityCheck, setCityCheck] = useState<CityCheck>({ status: "idle" });
  const cityCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const city = values.city.trim();
    if (cityCheckTimer.current) clearTimeout(cityCheckTimer.current);
    if (city.length < 2) {
      setCityCheck({ status: "idle" });
      return;
    }
    setCityCheck({ status: "checking" });
    cityCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/checkout/resolve-city", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city }),
        });
        const data = (await res.json().catch(() => null)) as { ok?: boolean; found?: boolean; fee?: number; label?: string } | null;
        if (data?.ok && data.found && typeof data.fee === "number") {
          setCityCheck({ status: "found", fee: data.fee, label: data.label ?? "" });
        } else {
          setCityCheck({ status: "unknown" });
        }
      } catch {
        setCityCheck({ status: "unknown" });
      }
    }, 500);
    return () => { if (cityCheckTimer.current) clearTimeout(cityCheckTimer.current); };
  }, [values.city]);

  /**
   * Picking a row from the CityCombobox's dropdown already tells us the shipping tier (the town
   * list it filters is grouped by tier — src/data/localities.ts) — no need to wait on the
   * debounced server round trip above for this case, which still runs for free-typed cities that
   * don't match a dropdown row. Cancel any pending check so it can't overwrite this with a stale
   * result a moment later.
   */
  function handleSelectTown(town: TownOption) {
    if (cityCheckTimer.current) clearTimeout(cityCheckTimer.current);
    setCityCheck({ status: "found", fee: SHIPPING_ILS_BY_TIER[town.tier], label: SHIPPING_LABEL_BY_TIER[town.tier] });
  }

  async function applyDiscountCode() {
    const code = discountInput.trim();
    if (!code) return;
    const upper = code.toUpperCase();
    if (appliedDiscounts.some((d) => d.code === upper)) { setDiscountInput(""); return; }
    setDiscountCheck({ status: "checking" });
    try {
      const res = await fetch("/api/checkout/discount/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; kind?: unknown; value?: unknown; minOrder?: unknown; stackable?: unknown; firstOrderOnly?: unknown }
        | null;
      if (data?.ok && (data.kind === "percent" || data.kind === "fixed") && typeof data.value === "number") {
        const next: AppliedDiscount = {
          code: upper, kind: data.kind, value: data.value,
          minOrder: typeof data.minOrder === "number" ? data.minOrder : 0,
          stackable: data.stackable === true,
          firstOrderOnly: data.firstOrderOnly === true,
        };
        // Same rule the server enforces (src/lib/discounts.ts
        // codesCanCombine): more than one code only works when EVERY one of
        // them is marked combinable.
        const combined = [...appliedDiscounts, next];
        if (combined.length > 1 && !combined.every((d) => d.stackable)) {
          setDiscountCheck({ status: "invalid", reason: "not_stackable" });
          return;
        }
        setAppliedDiscounts(combined);
        setDiscountInput("");
        setDiscountCheck({ status: "idle" });
      } else {
        setDiscountCheck({ status: "invalid", reason: "not_found" });
      }
    } catch {
      setDiscountCheck({ status: "invalid", reason: "not_found" });
    }
  }

  function removeDiscountCode(code: string) {
    setAppliedDiscounts((current) => current.filter((d) => d.code !== code));
    setDiscountCheck({ status: "idle" });
  }

  function clearDiscountCodes() {
    setAppliedDiscounts([]);
    setDiscountInput("");
    setDiscountCheck({ status: "idle" });
  }

  /**
   * The card page's failure and cancel URLs come back here with `?pay=`.
   * Read once into state so the note can be dismissed as soon as the customer
   * does anything, rather than sticking to the URL for the rest of the visit.
   * Neither value is alarming and neither claims a charge: both routes mean
   * no money moved.
   */
  const [returnNotice, setReturnNotice] = useState<ReturnState | null>(() => {
    const value = searchParams.get("pay");
    return isReturnState(value) ? value : null;
  });

  const byHandle = useMemo(
    () => new Map(products.map((product) => [product.handle, product])),
    [products],
  );
  const byAccessoryHandle = useMemo(
    () => new Map(accessories.map((accessory) => [accessory.handle, accessory])),
    [accessories],
  );

  // Same skip rule as the cart: a line whose handle is no longer an approved
  // product cannot be priced honestly, so it is not shown and not charged for.
  const lines = items
    .filter((item) => item.kind === "jersey")
    .map((item) => {
      const product = byHandle.get(item.handle);
      if (!product) return null;
      return {
        item,
        product,
        priced: priceLine(product.season, item.size, item.version, item.qty, {
          nameNumber: Boolean(item.nameNumber),
          patchCount: item.patches.length,
          sleeve: item.sleeve,
        }),
        key: lineKey(item),
      };
    })
    .filter((line) => line !== null);

  // Accessory lines: shown, counted and sent with the order (handle + qty only).
  const accessoryLines = items
    .filter((item) => item.kind === "accessory")
    .map((item) => {
      const accessory = byAccessoryHandle.get(item.handle);
      if (!accessory) return null;
      return {
        item,
        accessory,
        priced: {
          unitPrice: accessory.price,
          qty: item.qty,
          lineTotal: round2(accessory.price * item.qty),
        },
        key: lineKey(item),
      };
    })
    .filter((line) => line !== null);

  // Shipping needs a resolved city — 0 here is "not yet known", not "free".
  // The order is not submittable until cityCheck is "found" (see the button below).
  const shippingAmount = cityCheck.status === "found" ? cityCheck.fee : 0;
  const totals = cartTotals(
    [...lines.map((line) => line.priced), ...accessoryLines.map((line) => line.priced)],
    shippingAmount,
    giftBoxQty,
  );

  // Mirrors the server engine's own split (src/lib/pricing/engine.ts): a
  // code is worth a cut of the shirts + gift box, never of shipping, and
  // "qualifies" compares against that same pre-shipping figure, not the
  // grand total. Each applied code is quoted independently against that
  // SAME figure (not a shrinking base) — same as the server
  // (src/lib/orders/web.ts) — and the combined cut is capped at the items
  // subtotal so stacking several codes can never discount past 100%.
  // "cheaper with a shirt" accessory deals (scarf ₪40 with a shirt, owner request 2026-11-10): the
  // same rule the server engine applies, part of the items figure codes are measured against
  const deals = accessoryDeals(
    accessoryLines.map((line) => ({ category: line.accessory.category, qty: line.item.qty })),
    lines.reduce((n, line) => n + line.item.qty, 0),
  );
  const dealSaving = round2(deals.reduce((s, d) => s + d.saving, 0));
  const itemsSubtotal = round2(totals.subtotal + totals.giftBox - dealSaving);
  const qualifyingDiscounts = appliedDiscounts.filter((d) => itemsSubtotal >= d.minOrder);
  const perCodeAmount = (d: AppliedDiscount) => round2(d.kind === "percent" ? (itemsSubtotal * d.value) / 100 : d.value);
  const discountAmount = Math.min(itemsSubtotal, round2(qualifyingDiscounts.reduce((sum, d) => sum + perCodeAmount(d), 0)));
  const grandTotal = round2(totals.total - dealSaving - discountAmount);

  const parsed = CustomerSchema.safeParse({
    ...values,
    notes: values.notes.trim() === "" ? undefined : values.notes,
  });

  const fieldErrors = useMemo(() => {
    if (parsed.success) return {} as Partial<Record<FieldName, true>>;
    const errors: Partial<Record<FieldName, true>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string") errors[field as FieldName] = true;
    }
    return errors;
  }, [parsed]);

  function setField(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }) as FormValues);
    setErrorCode(null);
    // The return notice deliberately survives typing: the customer comes back
    // from a failed payment to an empty form, and the explanation has to stay
    // on screen while they fill it in again. It clears when they try to pay.
  }

  /** The cart's CHOICES, which is all either processor is ever sent - never a price. */
  function orderRequestBody() {
    return JSON.stringify({
      items: items
        .filter((item) => item.kind === "jersey")
        .map((item) => ({
          handle: item.handle,
          size: item.size,
          version: item.version,
          sleeve: item.sleeve,
          patches: item.patches,
          qty: item.qty,
          ...(item.nameNumber ? { nameNumber: item.nameNumber } : {}),
        })),
      // accessories are really ordered now (owner request 2026-11-10): handle + qty only, priced on the server
      accessories: items
        .filter((item) => item.kind === "accessory" && byAccessoryHandle.has(item.handle))
        .map((item) => ({ handle: item.handle, qty: item.qty })),
      customer: parsed.success ? parsed.data : null,
      locale,
      giftBoxQty,
      // Only the codes that actually qualify against this cart right now —
      // see qualifyingDiscounts above. The server re-checks everything
      // (eligibility, minimum order, and whether they're even allowed to
      // combine) regardless of what's sent here.
      ...(qualifyingDiscounts.length ? { discountCodes: qualifyingDiscounts.map((d) => d.code) } : {}),
    });
  }

  /**
   * The cash-on-delivery path (owner decision 2026-10-23: plain cash, no
   * deposit). Nothing is charged at all — the server writes a `pending`
   * order, emails the owner immediately, and hands back the reference. The
   * buyer simply pays the courier in full when the order arrives.
   */
  async function placeCashOrder() {
    setErrorCode(null);
    setReturnNotice(null);
    setPhase("placing");

    type CashResponse = { reference?: unknown; token?: unknown; code?: unknown; reason?: unknown } | null;
    let payload: CashResponse = null;
    try {
      const response = await fetch("/api/checkout/cash/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: orderRequestBody(),
      });
      payload = (await response.json().catch(() => null)) as CashResponse;
      if (response.ok && typeof payload?.reference === "string") {
        // Same order as the PayPal path: hold the "done" phase, empty the
        // cart, then hand over — so an emptied cart never flashes an "your
        // cart is empty" screen at someone who has just ordered.
        setPhase("done");
        clear();
        const token = typeof payload.token === "string" ? payload.token : "";
        router.push(
          `/checkout/thank-you?ref=${encodeURIComponent(payload.reference)}&t=${encodeURIComponent(token)}`,
        );
        return;
      }
    } catch {
      // Network failure — handled exactly like a rejected request below.
    }

    setPhase("form");
    const code = isErrorCode(payload?.code) ? payload.code : "server_error";
    // A code (or combination) the server rejected at the last moment
    // (expired, used up, or no longer stackable between the preview and
    // now) would otherwise keep being resent on every retry — clear them so
    // "Send order" can actually succeed next time.
    if (code === "invalid_discount_code") clearDiscountCodes();
    setErrorReason(typeof payload?.reason === "string" ? payload.reason : null);
    setErrorCode(code);
  }

  /**
   * PayPal and Bit share this shape: ask our own server to write the
   * (still-unpaid) order and mint a redirect URL, then send the browser's
   * top-level navigation there — never clear the cart or touch "done" here,
   * since nothing has been charged yet and the buyer may still cancel or
   * fail and come back to this same page (see returnNotice above). The cart
   * is only cleared once the thank-you page itself has confirmed payment.
   */
  async function placeRedirectOrder(path: "paypal" | "bit") {
    setErrorCode(null);
    setReturnNotice(null);
    setPhase("placing");

    type StartResponse = { approveUrl?: unknown; redirectUrl?: unknown; code?: unknown; reason?: unknown } | null;
    let payload: StartResponse = null;
    try {
      const response = await fetch(`/api/checkout/${path}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: orderRequestBody(),
      });
      payload = (await response.json().catch(() => null)) as StartResponse;
      const redirectUrl = typeof payload?.approveUrl === "string" ? payload.approveUrl : typeof payload?.redirectUrl === "string" ? payload.redirectUrl : null;
      if (response.ok && redirectUrl) {
        setPhase("redirecting");
        window.location.assign(redirectUrl);
        return;
      }
    } catch {
      // Network failure — handled exactly like a rejected request below.
    }

    setPhase("form");
    const code = isErrorCode(payload?.code) ? payload.code : "server_error";
    if (code === "invalid_discount_code") clearDiscountCodes();
    setErrorReason(typeof payload?.reason === "string" ? payload.reason : null);
    setErrorCode(code);
  }

  /**
   * Personal Bit / PayPal.Me: write the (unpaid) order, then show its pay
   * page on THIS site - the amount, the payee, the order number to put in the
   * note, and the "I've paid" form. Nothing is ever marked paid from here: the
   * owner confirms every one of these by hand (src/lib/orders/manual-pay.ts).
   */
  async function placeManualOrder(method: ManualMethod) {
    setErrorCode(null);
    setReturnNotice(null);
    setPhase("placing");
    attemptId.current ??= crypto.randomUUID();

    type StartResponse = { token?: unknown; code?: unknown; reason?: unknown } | null;
    let payload: StartResponse = null;
    try {
      const order = JSON.parse(orderRequestBody()) as Record<string, unknown>;
      const response = await fetch("/api/checkout/manual/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...order, method, attemptId: attemptId.current }),
      });
      payload = (await response.json().catch(() => null)) as StartResponse;
      if (response.ok && typeof payload?.token === "string") {
        // the order exists now: empty the cart (a second "Pay" can't make a second order) and go to its pay page
        setPhase("done");
        clear();
        router.push(`/checkout/pay?t=${encodeURIComponent(payload.token)}`);
        return;
      }
    } catch {
      // Network failure - handled exactly like a rejected request below.
    }

    setPhase("form");
    const code = isErrorCode(payload?.code) ? payload.code : "server_error";
    if (code === "invalid_discount_code") clearDiscountCodes();
    setErrorReason(typeof payload?.reason === "string" ? payload.reason : null);
    setErrorCode(code);
  }

  const placePayPalOrder = () => placeRedirectOrder("paypal");
  const placeBitOrder = () => placeRedirectOrder("bit");

  if (!hydrated) return <div className="min-h-[40vh]" aria-hidden />;

  if (phase === "done") {
    return (
      <p className="py-16 text-ink-soft" aria-live="polite">
        {t("processing")}
      </p>
    );
  }

  if (lines.length === 0 && accessoryLines.length === 0) {
    return (
      <div className="kv-panel mx-auto my-12 max-w-xl px-6 py-12 text-center">
        <h2 className="kv-section-title mb-2.5">{tCart("emptyTitle")}</h2>
        <p className="mx-auto mb-7 max-w-[46ch] text-ink-soft">{tCart("emptyBody")}</p>
        <Link href="/shop" className="btn">
          {tCommon("continueShopping")}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 py-8 wide:grid-cols-[1fr_400px] wide:gap-10 wide:py-12">
      {/* ---------- delivery details ---------- */}
      <section className="kv-panel p-5 sm:p-7">
        <h2 className="kv-filter-head mb-5 flex items-center !justify-start gap-3">
          <span className="grid size-7 place-items-center rounded-full bg-[#1f5cff] text-[13px] text-white">1</span>
          {t("detailsTitle")}
        </h2>

        <div className="flex flex-col gap-5">
          <Field
            name="name"
            label={t("fieldName")}
            value={values.name}
            invalid={touched.name === true && fieldErrors.name === true}
            error={t("errorName")}
            autoComplete="name"
            onChange={setField}
            onBlur={() => setTouched((current) => ({ ...current, name: true }))}
          />
          <Field
            name="phone"
            label={t("fieldPhone")}
            value={values.phone}
            invalid={touched.phone === true && fieldErrors.phone === true}
            error={t("errorPhone")}
            autoComplete="tel"
            inputMode="tel"
            /* A phone number is Latin digits in every locale: forced LTR so
               the caret, the plus sign and the grouping all read correctly
               inside an RTL page. */
            dir="ltr"
            onChange={setField}
            onBlur={() => setTouched((current) => ({ ...current, phone: true }))}
          />
          <Field
            name="email"
            label={t("fieldEmail")}
            value={values.email}
            invalid={touched.email === true && fieldErrors.email === true}
            error={t("errorEmail")}
            autoComplete="email"
            inputMode="email"
            type="email"
            dir="ltr"
            onChange={setField}
            onBlur={() => setTouched((current) => ({ ...current, email: true }))}
          />
          {/* Split into Street and House/apartment number (owner decision
              2026-10-23), replacing the single free-text address field. */}
          <Field
            name="street"
            label={t("fieldStreet")}
            value={values.street}
            invalid={touched.street === true && fieldErrors.street === true}
            error={t("errorStreet")}
            autoComplete="address-line1"
            onChange={setField}
            onBlur={() => setTouched((current) => ({ ...current, street: true }))}
          />
          <Field
            name="houseNumber"
            label={t("fieldHouseNumber")}
            value={values.houseNumber}
            invalid={touched.houseNumber === true && fieldErrors.houseNumber === true}
            error={t("errorHouseNumber")}
            autoComplete="address-line2"
            onChange={setField}
            onBlur={() => setTouched((current) => ({ ...current, houseNumber: true }))}
          />
          <CityCombobox
            id="checkout-city"
            label={t("fieldCity")}
            value={values.city}
            invalid={touched.city === true && fieldErrors.city === true}
            error={t("errorCity")}
            locale={locale}
            onChange={(value) => setField("city", value)}
            onBlur={() => setTouched((current) => ({ ...current, city: true }))}
            onSelectTown={handleSelectTown}
          />

          {/* Owner decision 2026-10-25: no region picker. The city above is
              resolved against the server's town → zone list (cityCheck),
              never guessed client-side — this just shows what came back. */}
          {cityCheck.status === "checking" ? (
            <p className="text-xs text-ink-soft">{t("cityChecking")}</p>
          ) : cityCheck.status === "found" ? (
            <p className="flex items-baseline gap-2 text-sm">
              <span className="text-ink-soft">{t("cityFoundLabel", { town: cityCheck.label })}</span>
              <span dir="ltr" className="font-medium">⁦₪{cityCheck.fee}⁩</span>
            </p>
          ) : cityCheck.status === "unknown" ? (
            <p className="text-xs text-ink-soft">{t("cityUnknown")}</p>
          ) : null}

          <Field
            name="notes"
            label={t("fieldNotes")}
            value={values.notes}
            invalid={touched.notes === true && fieldErrors.notes === true}
            error={t("errorNotes")}
            optionalLabel={t("optional")}
            multiline
            onChange={setField}
            onBlur={() => setTouched((current) => ({ ...current, notes: true }))}
          />
        </div>
      </section>

      {/* ---------- summary + payment ---------- */}
      <section className="kv-panel p-5 sm:p-7 wide:sticky wide:top-28 wide:self-start">
        <h2 className="kv-filter-head mb-4 flex items-center !justify-start gap-3">
          <span className="grid size-7 place-items-center rounded-full bg-[#1f5cff] text-[13px] text-white">2</span>
          {t("summaryTitle")}
        </h2>

        <ul className="border-t border-rule">
          {lines.map(({ item, product, priced, key }) => (
            <li
              key={key}
              className="grid grid-cols-[64px_1fr_auto] items-start gap-4 border-b border-rule py-4"
            >
              <span className="grid aspect-square place-items-center overflow-hidden rounded-[10px] bg-[#f1f3f7]">
                <Image
                  src={product.image}
                  alt={locale === "ar" ? product.titleAr : product.title}
                  width={128}
                  height={128}
                  sizes="64px"
                  className="aspect-square h-auto w-full object-contain"
                />
              </span>
              <span className="text-[13px]">
                <span className="block font-semibold">
                  {locale === "ar" ? product.titleAr : locale === "he" && product.titleHe ? product.titleHe : product.title}
                </span>
                <span className="block text-ink-soft">
                  <span className="latin tabular">{item.size}</span>
                  {" · "}
                  {item.version === "fan"
                    ? tProduct("versionFan")
                    : tProduct("versionPlayer")}
                  {" · "}
                  {item.sleeve === "long"
                    ? tProduct("sleeveLong")
                    : tProduct("sleeveShort")}
                  {" · "}
                  <Figure>{item.qty}</Figure>
                </span>
                {item.nameNumber ? (
                  <span className="block text-ink-soft">
                    {tCart("propNameNumber")}:{" "}
                    <bdi dir="ltr" className="latin">
                      {item.nameNumber}
                    </bdi>
                  </span>
                ) : null}
                {item.patches.length > 0 ? (
                  <span className="block text-ink-soft">
                    {tCart("propPatch")}:{" "}
                    {item.patches.map((p) => tCart(PATCH_PROP_KEYS[p])).join(" + ")}
                  </span>
                ) : null}
              </span>
              <span className="text-[13.5px] font-bold text-ink">
                <Price value={priced.lineTotal} />
              </span>
            </li>
          ))}
          {accessoryLines.map(({ item, accessory, priced, key }) => (
            <li
              key={key}
              className="grid grid-cols-[64px_1fr_auto] items-start gap-4 border-b border-rule py-4"
            >
              <span className="grid aspect-square place-items-center overflow-hidden rounded-[10px] bg-[#f1f3f7]">
                <Image
                  src={accessory.image}
                  alt={accessoryLabel(tAccessories, accessory, locale)}
                  width={128}
                  height={128}
                  sizes="64px"
                  className="h-auto w-[86%] mix-blend-multiply"
                />
              </span>
              <span className="text-[13px]">
                <span className="block">{accessoryLabel(tAccessories, accessory, locale)}</span>
                {item.qty > 1 ? <span className="block text-ink-soft" dir="ltr">×{item.qty}</span> : null}
              </span>
              <span className="text-[13.5px] font-bold text-ink">
                <Price value={priced.lineTotal} />
              </span>
            </li>
          ))}
        </ul>

        {/* Gift box (owner decision 2026-10-23) — one per order, but
            quantity-selectable, since a single box can hold more than one
            shirt. Checkout-only: the cart page has no equivalent. */}
        <div className="border-b border-rule py-5">
          <label
            htmlFor="checkout-gift-box"
            className="kv-legend"
          >
            {t("giftBoxLegend")}
          </label>
          <p className="mb-2.5 text-xs text-ink-soft">
            {t("giftBoxHint", { price: String(GIFT_BOX_PRICE) })}
          </p>
          <select
            id="checkout-gift-box"
            dir="ltr"
            value={giftBoxQty}
            onChange={(event) => setGiftBoxQty(Number(event.target.value))}
            className="kv-select tabular w-36"
          >
            <option value={0}>{t("giftBoxNone")}</option>
            {Array.from({ length: GIFT_BOX_MAX_QTY }, (_, index) => index + 1).map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
        </div>

        {/* Discount codes (owner feature 2026-10-26): checked against the
            server as the shopper types each one, same preview-only posture
            as the city field above. More than one can be applied together
            only when every one of them is marked combinable in admin
            Discounts — see applyDiscountCode. */}
        <div className="border-b border-rule py-5">
          <label htmlFor="checkout-discount" className="kv-legend">
            {t("discountLabel")}
          </label>
          {appliedDiscounts.length > 0 ? (
            <ul className="mb-2.5 flex flex-col gap-1.5">
              {appliedDiscounts.map((d) => (
                <li key={d.code} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex flex-col">
                    <span dir="ltr" className="latin font-medium">{d.code}</span>
                    {d.firstOrderOnly ? <span className="text-xs text-ink-soft">{t("discountFirstOrderOnly")}</span> : null}
                  </span>
                  <button type="button" className="text-xs text-ink-soft underline underline-offset-4" onClick={() => removeDiscountCode(d.code)}>
                    {t("discountRemove")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {appliedDiscounts.length < MAX_DISCOUNT_CODES ? (
            <div className="flex gap-2">
              <input
                id="checkout-discount"
                dir="ltr"
                value={discountInput}
                onChange={(event) => { setDiscountInput(event.target.value); setDiscountCheck({ status: "idle" }); }}
                className="kv-input latin"
              />
              <button
                type="button"
                className="btn btn-quiet shrink-0 !px-5"
                disabled={!discountInput.trim() || discountCheck.status === "checking"}
                onClick={applyDiscountCode}
              >
                {discountCheck.status === "checking" ? t("discountChecking") : t("discountApply")}
              </button>
            </div>
          ) : null}
          {discountCheck.status === "invalid" ? (
            <p className="mt-2 text-xs text-ink-soft">
              {discountCheck.reason === "not_stackable" ? t("discountNotStackable") : t("discountInvalid")}
            </p>
          ) : null}
          {appliedDiscounts.filter((d) => itemsSubtotal < d.minOrder).map((d) => (
            <p key={d.code} className="mt-2 text-xs text-ink-soft">
              {t("discountMinOrder", { code: d.code, amount: String(d.minOrder) })}
            </p>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 pt-5">
          <Row label={tCart("subtotal")}>
            <Price value={totals.subtotal} />
          </Row>
          <Row label={tCart("shipping")}>
            {cityCheck.status === "found" ? (
              <span className="flex items-baseline gap-2">
                <span className="text-ink-soft" dir="auto">{cityCheck.label}</span>
                <Price value={shippingAmount} />
              </span>
            ) : (
              <span className="text-ink-soft">{tCart("shippingTbd")}</span>
            )}
          </Row>
          {giftBoxQty > 0 ? (
            <Row label={t("giftBoxRow", { qty: String(giftBoxQty) })}>
              <Price value={totals.giftBox} />
            </Row>
          ) : null}
          {deals.map((d) => (
            <Row key={d.category} label={tAccessories("dealRow", { qty: String(d.qty) })}>
              <span dir="ltr">
                -<Price value={d.saving} />
              </span>
            </Row>
          ))}
          {qualifyingDiscounts.map((d) => (
            <Row key={d.code} label={t("discountRow", { code: d.code })}>
              <span dir="ltr">
                -<Price value={perCodeAmount(d)} />
              </span>
            </Row>
          ))}
          <div className="flex items-baseline justify-between border-t border-rule pt-4">
            <span className="font-bold">{tCart("total")}</span>
            <Price value={grandTotal} className="text-[1.6rem] leading-none font-extrabold" />
          </div>
          <p className="text-xs text-ink-soft">{tCart("deliveryNote")}</p>
        </div>

        <div className="mt-7">
          {/* Outside the gating below on purpose. A customer coming back from
              a failed or cancelled card payment lands on an EMPTY form — the
              details are not persisted — so a notice rendered only once the
              form validates is a notice they would never see. */}
          {returnNotice ? (
            <p
              role="status"
              className="mb-5 rounded-[10px] border border-[#f0c36d] bg-[#fff8e6] px-4 py-3.5 text-sm text-[#5c4100]"
            >
              {returnNotice === "failed" ? t("returnFailed") : returnNotice === "pending" ? t("returnPending") : t("returnCancelled")}
            </p>
          ) : null}

          {!cashEnabled && !paypalEnabled && !bitEnabled && !manualMethods.bitPersonal && !manualMethods.paypalMe ? (
            <DemoPanel title={t("demoTitle")} body={t("demoBody")} />
          ) : (
            <div className="flex flex-col gap-6">
              <h3 className="kv-filter-head mb-0 flex items-center !justify-start gap-3">
                <span className="grid size-7 place-items-center rounded-full bg-[#1f5cff] text-[13px] text-white">3</span>
                {t("payTitle")}
              </h3>

              {/* Three methods, each shown only when it is configured
                  (owner decision 2026-10-31, Part 7): Bit clears through
                  PayPlus's hosted page (a redirect, same as PayPal below —
                  whichever charge methods the real PayPlus account has
                  enabled is what that page actually offers), PayPal covers
                  everything else, and cash on delivery (owner decision
                  2026-10-23: plain, no deposit) stays last. Every button
                  disables while ANY of the three is mid-flight, not just the
                  one clicked. */}
              {bitEnabled ? (
                <div className="rounded-[12px] border border-rule p-4">
                  <p className="mb-1.5 text-sm font-bold">{t("payCard")}</p>
                  <p className="mb-1.5 text-xs text-ink-soft">{t("payCardNote")}</p>
                  <p className="mb-4 text-xs text-ink-soft">{t("payCardLanguage")}</p>
                  <button
                    type="button"
                    className="btn w-full"
                    disabled={phase !== "form" || !parsed.success || cityCheck.status !== "found"}
                    onClick={placeBitOrder}
                  >
                    {phase === "redirecting" ? t("redirecting") : phase === "placing" ? t("payCodPlacing") : t("payCard")}
                  </button>
                </div>
              ) : null}

              {paypalEnabled ? (
                <div className="rounded-[12px] border border-rule p-4">
                  <p className="mb-4 text-xs text-ink-soft">{t("payPalNote")}</p>
                  <button
                    type="button"
                    className="btn btn-quiet w-full"
                    disabled={phase !== "form" || !parsed.success || cityCheck.status !== "found"}
                    onClick={placePayPalOrder}
                  >
                    {phase === "redirecting" ? t("redirecting") : phase === "placing" ? t("payCodPlacing") : "PayPal"}
                  </button>
                </div>
              ) : null}

              {/* Personal Bit (owner request 2026-11-10): a transfer to the owner's own Bit
                  number, confirmed by hand. The next page shows the number, the exact
                  amount and the order number for the note. */}
              {manualMethods.bitPersonal ? (
                <div className="rounded-[12px] border border-rule p-4">
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <BitMark className="h-6" />
                    <p className="text-sm font-bold">{t("payBitPersonal")}</p>
                  </div>
                  <p className="mb-4 text-xs text-ink-soft">{t("payBitPersonalNote")}</p>
                  <button
                    type="button"
                    className="btn w-full"
                    disabled={phase !== "form" || !parsed.success || cityCheck.status !== "found"}
                    onClick={() => placeManualOrder("bit_personal")}
                  >
                    {phase === "placing" ? t("payCodPlacing") : t("payBitPersonalButton")}
                  </button>
                </div>
              ) : null}

              {/* PayPal.Me (owner request 2026-11-10): the owner's personal PayPal.Me link,
                  amount pre-filled, confirmed by hand. */}
              {manualMethods.paypalMe ? (
                <div className="rounded-[12px] border border-rule p-4">
                  <p className="mb-1.5 text-sm font-bold">{t("payPalMe")}</p>
                  <p className="mb-4 text-xs text-ink-soft">{t("payPalMeNote")}</p>
                  <button
                    type="button"
                    className="btn btn-quiet w-full"
                    disabled={phase !== "form" || !parsed.success || cityCheck.status !== "found"}
                    onClick={() => placeManualOrder("paypal_me")}
                  >
                    {phase === "placing" ? t("payCodPlacing") : t("payPalMeButton")}
                  </button>
                </div>
              ) : null}

              {/* Cash on delivery — last, and plain (owner decision
                  2026-10-23): no deposit, nothing charged here at all. The
                  buyer pays the courier in full when the order arrives.
                  The button (owner request 2026-10-24) is always on screen,
                  grey and disabled until the delivery form validates, then
                  reads as active — never hidden behind a separate message. */}
              {cashEnabled ? (
                <div className="rounded-[12px] border border-rule p-4">
                  {bitEnabled || paypalEnabled || manualMethods.bitPersonal || manualMethods.paypalMe ? <p className="mb-1.5 text-sm font-bold">{t("payCodIntro")}</p> : null}
                  <p className="mb-4 text-xs text-ink-soft">{t("payCashNote")}</p>
                  <button
                    type="button"
                    className="btn w-full"
                    disabled={phase !== "form" || !parsed.success || cityCheck.status !== "found"}
                    onClick={placeCashOrder}
                  >
                    {phase === "placing" ? t("payCodPlacing") : t("payCod")}
                  </button>
                </div>
              ) : null}

              {/* One shared reason, shown once, for every disabled control
                  above — not a separate panel replacing them. */}
              {!parsed.success || cityCheck.status !== "found" ? (
                <p className="text-xs text-ink-soft">{t("formIncomplete")}</p>
              ) : null}
            </div>
          )}

          <p aria-live="polite" className="mt-3 min-h-6 text-sm font-semibold text-[#c0392b]">
            {errorCode ? <ErrorMessage code={errorCode} reason={errorReason} /> : null}
          </p>

          {/* The cancellation right lives in the terms; it has to be reachable
              from the moment of payment, not buried in the footer. */}
          <p className="mt-2 text-xs text-ink-soft">
            {t.rich("termsLine", {
              terms: (chunks) => (
                <Link href="/terms" className="font-semibold text-[#1f5cff] underline-offset-4 hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </section>
    </div>
  );
}

function ErrorMessage({ code, reason }: { code: CheckoutErrorCode; reason?: string | null }) {
  const t = useTranslations("checkout");
  if (code === "invalid_discount_code" && reason === "first_order_only") return <>{t("errorFirstOrderOnly")}</>;
  switch (code) {
    case "cart_empty":
      return <>{t("errorCartEmpty")}</>;
    case "unknown_city":
      return <>{t("cityUnknown")}</>;
    case "invalid_discount_code":
      return <>{t("errorDiscountCode")}</>;
    case "payments_unconfigured":
      return <>{t("errorUnconfigured")}</>;
    case "rate_limited":
      return <>{t("errorRateLimited")}</>;
    case "capture_failed":
    case "paypal_failed":
    case "payplus_failed":
    case "order_not_found":
      return <>{t("errorCapture")}</>;
    default:
      return <>{t("errorGeneric")}</>;
  }
}

function DemoPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-rule bg-chip px-4 py-4">
      <p className="mb-1.5 text-sm">{title}</p>
      <p className="text-sm text-ink-soft">{body}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Field({
  name,
  label,
  value,
  invalid,
  error,
  optionalLabel,
  multiline,
  onChange,
  onBlur,
  ...input
}: {
  name: FieldName;
  label: string;
  value: string;
  invalid: boolean;
  error: string;
  optionalLabel?: string;
  multiline?: boolean;
  onChange: (field: FieldName, value: string) => void;
  onBlur: () => void;
  // The rest passes straight through to <input> — dir, type, inputMode,
  // autoComplete. The handlers are ours, so they are omitted rather than
  // silently overwritten by a caller.
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "onBlur" | "name" | "value" | "id"
>) {
  const id = `checkout-${name}`;
  const className = `kv-input ${invalid ? "!border-[#c0392b]" : ""}`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13.5px] font-semibold text-ink">
        {label}
        {optionalLabel ? <span className="ms-2 font-normal text-ink-soft">({optionalLabel})</span> : null}
      </label>
      {multiline ? (
        <textarea
          id={id}
          name={name}
          rows={3}
          value={value}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => onChange(name, event.target.value)}
          onBlur={onBlur}
          className={className}
        />
      ) : (
        <input
          id={id}
          name={name}
          type="text"
          value={value}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => onChange(name, event.target.value)}
          onBlur={onBlur}
          className={className}
          {...input}
        />
      )}
      {invalid ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-[#c0392b]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
