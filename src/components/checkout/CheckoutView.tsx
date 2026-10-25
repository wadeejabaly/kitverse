"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { GIFT_BOX_MAX_QTY, GIFT_BOX_PRICE, SHIPPING_ILS_BY_TIER, SHIPPING_LABEL_BY_TIER, cartTotals, priceLine, round2 } from "@/data/pricing";
import { lineKey, useCart } from "@/components/cart/CartProvider";
import type { CartAccessoryInfo, CartProductInfo } from "@/components/cart/CartView";
import { Figure, Price } from "@/components/shared/Money";
import { CustomerSchema, type CheckoutErrorCode } from "@/lib/checkout";
import { CityCombobox } from "@/components/checkout/CityCombobox";
import type { TownOption } from "@/data/localities";

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
 * Accessories (2026-10-25, phase 1 of the keychains feature): shown in the
 * summary so the total still matches the cart, but excluded from the order
 * actually sent — orderRequestBody() only ever lists jersey items, since the
 * database and the order-writing code don't have an accessory concept yet
 * (see the project notes for the migration that will add one). A banner and
 * a per-line tag say so plainly rather than silently dropping the item.
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
  "payments_unconfigured",
  "paypal_failed",
  "payplus_failed",
  "order_not_found",
  "capture_failed",
  "rate_limited",
  "server_error",
];

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
type ReturnState = "failed" | "cancelled";

function isReturnState(value: unknown): value is ReturnState {
  return value === "failed" || value === "cancelled";
}

export function CheckoutView({
  products,
  accessories,
  locale,
  cashEnabled,
}: {
  products: CartProductInfo[];
  accessories: CartAccessoryInfo[];
  locale: string;
  cashEnabled: boolean;
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
  // The gift-box add-on (owner decision 2026-10-23): a per-ORDER quantity,
  // not a per-shirt flag — 0 means no box at all.
  const [giftBoxQty, setGiftBoxQty] = useState(0);

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
          patch: item.patch,
        }),
        key: lineKey(item),
      };
    })
    .filter((line) => line !== null);

  // Accessory lines (2026-10-25): shown in the summary and counted in the
  // total so the number on screen matches the cart page, but NOT sent to
  // the server — see orderRequestBody() and the banner below.
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

  /**
   * The cart's CHOICES, which is all either processor is ever sent.
   *
   * Jersey items only (2026-10-25): the order-writing code and the database
   * have no accessory concept yet, so an accessory line in the cart is left
   * out here entirely rather than sent in a shape the server would reject or
   * silently mis-handle. The summary UI says this plainly; see the file doc
   * comment.
   */
  function orderRequestBody() {
    return JSON.stringify({
      items: items
        .filter((item) => item.kind === "jersey")
        .map((item) => ({
          handle: item.handle,
          size: item.size,
          version: item.version,
          patch: item.patch,
          qty: item.qty,
          ...(item.nameNumber ? { nameNumber: item.nameNumber } : {}),
        })),
      customer: parsed.success ? parsed.data : null,
      locale,
      giftBoxQty,
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

    type CashResponse = { reference?: unknown; token?: unknown; code?: unknown } | null;
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
    setErrorCode(isErrorCode(payload?.code) ? payload.code : "server_error");
  }

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
      <div className="py-16">
        <h2 className="mb-2.5 text-xl">{tCart("emptyTitle")}</h2>
        <p className="mb-7 max-w-[46ch] text-ink-soft">{tCart("emptyBody")}</p>
        <Link href="/shop" className="btn">
          {tCommon("continueShopping")}
        </Link>
      </div>
    );
  }

  // A cart that is only keychains has nothing checkout can submit yet.
  if (lines.length === 0) {
    return (
      <div className="py-16">
        <h2 className="mb-2.5 text-xl">{tAccessories("checkoutExcluded")}</h2>
        <p className="mb-7 max-w-[46ch] text-ink-soft">{tAccessories("checkoutNotice")}</p>
        <Link href="/cart" className="btn">
          {tAccessories("viewCart")}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-12 pt-8 pb-16 wide:grid-cols-[1fr_380px] wide:gap-16">
      {/* ---------- delivery details ---------- */}
      <section>
        <h2 className="mono-eyebrow mb-5 text-ink-soft">{t("detailsTitle")}</h2>

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

          {/* Country is not a choice at launch — saying so is more honest than
              a select with one option in it. */}
          <div>
            <span className="mono-eyebrow mb-2 block text-ink-soft">
              {t("fieldCountry")}
            </span>
            <p className="border border-rule bg-chip px-3.5 py-3 text-sm">
              {t("countryValue")}
            </p>
            <p className="mt-2 text-xs text-ink-soft">{t("countryNote")}</p>
          </div>

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
      <section className="wide:sticky wide:top-8 wide:self-start">
        <h2 className="mono-eyebrow mb-5 text-ink-soft">{t("summaryTitle")}</h2>

        <ul className="border-t border-rule">
          {lines.map(({ item, product, priced, key }) => (
            <li
              key={key}
              className="grid grid-cols-[64px_1fr_auto] items-start gap-4 border-b border-rule py-4"
            >
              <span className="grid aspect-square place-items-center bg-tile">
                <Image
                  src={product.image}
                  alt={locale === "ar" ? product.titleAr : product.title}
                  width={128}
                  height={128}
                  sizes="64px"
                  className="h-auto w-[86%]"
                />
              </span>
              <span className="text-[13px]">
                <span className="block">
                  {locale === "ar" ? product.titleAr : product.title}
                </span>
                <span className="block text-ink-soft">
                  <span className="latin tabular">{item.size}</span>
                  {" · "}
                  {item.version === "fan"
                    ? tProduct("versionFan")
                    : tProduct("versionPlayer")}
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
                {item.patch !== "none" ? (
                  <span className="block text-ink-soft">
                    {tCart("propPatch")}:{" "}
                    {item.patch === "ucl"
                      ? tCart("propPatchUcl")
                      : item.patch === "worldcup"
                        ? tCart("propPatchWorldCup")
                        : tCart("propPatchLeague")}
                  </span>
                ) : null}
              </span>
              <span className="text-accent text-[13px]">
                <Price value={priced.lineTotal} />
              </span>
            </li>
          ))}
          {accessoryLines.map(({ accessory, priced, key }) => (
            <li
              key={key}
              className="grid grid-cols-[64px_1fr_auto] items-start gap-4 border-b border-rule py-4"
            >
              <span className="grid aspect-square place-items-center bg-tile">
                <Image
                  src={accessory.image}
                  alt={locale === "ar" ? accessory.teamAr : accessory.team}
                  width={128}
                  height={128}
                  sizes="64px"
                  className="h-auto w-[86%]"
                />
              </span>
              <span className="text-[13px]">
                <span className="block">
                  {tAccessories("keychainTitle", {
                    team: locale === "ar" ? accessory.teamAr : accessory.team,
                  })}
                </span>
                <span className="block text-ink-soft">{tAccessories("checkoutExcluded")}</span>
              </span>
              <span className="text-accent text-[13px]">
                <Price value={priced.lineTotal} />
              </span>
            </li>
          ))}
        </ul>

        {accessoryLines.length > 0 ? (
          <p className="mt-4 border border-rule bg-chip px-4 py-3.5 text-xs text-ink-soft">
            {tAccessories("checkoutNotice")}
          </p>
        ) : null}

        {/* Gift box (owner decision 2026-10-23) — one per order, but
            quantity-selectable, since a single box can hold more than one
            shirt. Checkout-only: the cart page has no equivalent. */}
        <div className="border-b border-rule py-5">
          <label
            htmlFor="checkout-gift-box"
            className="mono-eyebrow mb-2.5 block text-ink-soft"
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
            className="tabular w-32 border border-rule bg-field px-3 py-2.5 text-sm text-ink"
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
          <div className="flex justify-between border-t border-rule pt-3 text-[17px]">
            <span>{tCart("total")}</span>
            <Price value={totals.total} />
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
              className="mb-5 border border-rule px-4 py-3.5 text-sm text-ink-soft"
            >
              {returnNotice === "failed" ? t("returnFailed") : t("returnCancelled")}
            </p>
          ) : null}

          {!cashEnabled ? (
            <DemoPanel title={t("demoTitle")} body={t("demoBody")} />
          ) : (
            <div className="flex flex-col gap-6">
              <h3 className="mono-eyebrow text-ink-soft">{t("payTitle")}</h3>

              {/* Cash on delivery — last, and plain (owner decision
                  2026-10-23): no deposit, nothing charged here at all. The
                  buyer pays the courier in full when the order arrives.
                  The button (owner request 2026-10-24) is always on screen,
                  grey and disabled until the delivery form validates, then
                  reads as active — never hidden behind a separate message. */}
              {cashEnabled ? (
                <div>
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

          <p aria-live="polite" className="mt-3 min-h-6 text-sm text-ink-soft">
            {errorCode ? <ErrorMessage code={errorCode} /> : null}
          </p>

          {/* The cancellation right lives in the terms; it has to be reachable
              from the moment of payment, not buried in the footer. */}
          <p className="mt-2 text-xs text-ink-soft">
            {t.rich("termsLine", {
              terms: (chunks) => (
                <Link href="/terms" className="text-ink underline underline-offset-4">
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

function ErrorMessage({ code }: { code: CheckoutErrorCode }) {
  const t = useTranslations("checkout");
  switch (code) {
    case "cart_empty":
      return <>{t("errorCartEmpty")}</>;
    case "unknown_city":
      return <>{t("cityUnknown")}</>;
    case "payments_unconfigured":
      return <>{t("errorUnconfigured")}</>;
    case "rate_limited":
      return <>{t("errorRateLimited")}</>;
    case "capture_failed":
      return <>{t("errorCapture")}</>;
    default:
      return <>{t("errorGeneric")}</>;
  }
}

function DemoPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-rule bg-chip px-4 py-4">
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
  const className = `w-full border bg-field px-3.5 py-3 text-sm text-ink ${
    invalid ? "border-ink" : "border-rule"
  }`;

  return (
    <div>
      <label htmlFor={id} className="mono-eyebrow mb-2 block text-ink-soft">
        {label}
        {optionalLabel ? <span className="ms-2">({optionalLabel})</span> : null}
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
        <p id={`${id}-error`} className="mt-1.5 text-xs text-ink-soft">
          {error}
        </p>
      ) : null}
    </div>
  );
}
