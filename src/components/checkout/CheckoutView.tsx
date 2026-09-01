"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { Link, useRouter } from "@/i18n/navigation";
import { SHIPPING_ILS_DOMESTIC, cartTotals, priceLine } from "@/data/pricing";
import { lineKey, useCart } from "@/components/cart/CartProvider";
import type { CartProductInfo } from "@/components/cart/CartView";
import { Figure, Price } from "@/components/shared/Money";
import { CustomerSchema, type CheckoutErrorCode } from "@/lib/checkout";

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
 * The PayPal buttons deliberately do not exist until the delivery form
 * validates. A buyer who pays and only then discovers their address was
 * rejected has been failed by the page.
 */

type FormValues = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
};

const EMPTY_FORM: FormValues = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  notes: "",
};

type FieldName = keyof FormValues;

const ERROR_CODES: readonly CheckoutErrorCode[] = [
  "invalid_request",
  "cart_empty",
  "payments_unconfigured",
  "paypal_failed",
  "order_not_found",
  "capture_failed",
  "rate_limited",
  "server_error",
];

function isErrorCode(value: unknown): value is CheckoutErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function CheckoutView({
  products,
  locale,
  paypalClientId,
}: {
  products: CartProductInfo[];
  locale: string;
  paypalClientId: string | null;
}) {
  const t = useTranslations("checkout");
  const tCart = useTranslations("cart");
  const tCommon = useTranslations("common");
  const tProduct = useTranslations("product");
  const router = useRouter();
  const { items, hydrated, clear } = useCart();

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [phase, setPhase] = useState<"form" | "paying" | "done">("form");
  const [errorCode, setErrorCode] = useState<CheckoutErrorCode | null>(null);

  const byHandle = useMemo(
    () => new Map(products.map((product) => [product.handle, product])),
    [products],
  );

  // Same skip rule as the cart: a line whose handle is no longer an approved
  // product cannot be priced honestly, so it is not shown and not charged for.
  const lines = items
    .map((item) => {
      const product = byHandle.get(item.handle);
      if (!product) return null;
      return {
        item,
        product,
        priced: priceLine(product.kind, item.size, item.version, item.qty, {
          nameNumber: Boolean(item.nameNumber),
          badge: item.badge,
        }),
        key: lineKey(item),
      };
    })
    .filter((line) => line !== null);

  const totals = cartTotals(lines.map((line) => line.priced));

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
    setValues((current) => ({ ...current, [field]: value }));
    setErrorCode(null);
  }

  async function createPayPalOrder(): Promise<string> {
    setErrorCode(null);
    const response = await fetch("/api/checkout/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Choices only — never a price. See the note at the top of this file.
        items: items.map((item) => ({
          handle: item.handle,
          size: item.size,
          version: item.version,
          badge: item.badge,
          qty: item.qty,
          ...(item.nameNumber ? { nameNumber: item.nameNumber } : {}),
        })),
        customer: parsed.success ? parsed.data : null,
        locale,
      }),
    });
    const body: unknown = await response.json().catch(() => null);
    const payload = body as { paypalOrderId?: unknown; code?: unknown } | null;

    if (!response.ok || typeof payload?.paypalOrderId !== "string") {
      setErrorCode(isErrorCode(payload?.code) ? payload.code : "server_error");
      throw new Error("create-order failed");
    }
    return payload.paypalOrderId;
  }

  async function capture(paypalOrderId: string): Promise<void> {
    setPhase("paying");
    const response = await fetch("/api/checkout/capture-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paypalOrderId }),
    });
    const body: unknown = await response.json().catch(() => null);
    const payload = body as { status?: unknown; reference?: unknown; code?: unknown } | null;

    if (!response.ok || payload?.status !== "paid") {
      setPhase("form");
      setErrorCode(isErrorCode(payload?.code) ? payload.code : "capture_failed");
      return;
    }

    // Paid. Empty the cart and hand over to the confirmation page — in that
    // order, behind the "done" phase, so the emptied cart never flashes an
    // "your cart is empty" screen at someone who has just paid.
    setPhase("done");
    clear();
    const reference = typeof payload.reference === "string" ? payload.reference : "";
    router.push(`/checkout/thank-you?ref=${encodeURIComponent(reference)}`);
  }

  if (!hydrated) return <div className="min-h-[40vh]" aria-hidden />;

  if (phase === "done") {
    return (
      <p className="py-16 text-ink-soft" aria-live="polite">
        {t("processing")}
      </p>
    );
  }

  if (lines.length === 0) {
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
          <Field
            name="address"
            label={t("fieldAddress")}
            value={values.address}
            invalid={touched.address === true && fieldErrors.address === true}
            error={t("errorAddress")}
            autoComplete="street-address"
            onChange={setField}
            onBlur={() => setTouched((current) => ({ ...current, address: true }))}
          />
          <Field
            name="city"
            label={t("fieldCity")}
            value={values.city}
            invalid={touched.city === true && fieldErrors.city === true}
            error={t("errorCity")}
            autoComplete="address-level2"
            onChange={setField}
            onBlur={() => setTouched((current) => ({ ...current, city: true }))}
          />

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
                {item.badge ? (
                  <span className="block text-ink-soft">
                    {tCart("propBadge")}: {tCart("propBadgeYes")}
                  </span>
                ) : null}
              </span>
              <span className="text-accent text-[13px]">
                <Price value={priced.lineTotal} />
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2.5 pt-5">
          <Row label={tCart("subtotal")}>
            <Price value={totals.subtotal} />
          </Row>
          <Row label={tCart("shipping")}>
            <span className="flex items-baseline gap-2">
              <span className="text-ink-soft">{tCart("shippingLabel")}</span>
              <Price value={SHIPPING_ILS_DOMESTIC} />
            </span>
          </Row>
          <div className="flex justify-between border-t border-rule pt-3 text-[17px]">
            <span>{tCart("total")}</span>
            <Price value={totals.total} />
          </div>
          <p className="text-xs text-ink-soft">{tCart("deliveryNote")}</p>
        </div>

        <div className="mt-7">
          {paypalClientId === null ? (
            <DemoPanel title={t("demoTitle")} body={t("demoBody")} />
          ) : !parsed.success ? (
            <p className="border border-rule px-4 py-3.5 text-sm text-ink-soft">
              {t("formIncomplete")}
            </p>
          ) : (
            <PayPalScriptProvider
              options={{
                clientId: paypalClientId,
                currency: "ILS",
                intent: "capture",
                components: "buttons",
                // PayPal's own locale codes: ar_EG is the Arabic checkout it
                // ships; there is no ar_IL.
                locale: locale === "ar" ? "ar_EG" : "en_US",
              }}
            >
              <PayPalButtons
                // Re-mount when the amount changes so a stale button can never
                // create an order for a total the customer has moved on from.
                forceReRender={[totals.total, locale]}
                style={{ layout: "vertical", shape: "sharp", label: "pay" }}
                disabled={phase !== "form"}
                createOrder={createPayPalOrder}
                onApprove={async (data) => {
                  if (typeof data.orderID === "string") await capture(data.orderID);
                }}
                onCancel={() => setPhase("form")}
                onError={() => {
                  setPhase("form");
                  setErrorCode((current) => current ?? "server_error");
                }}
              />
            </PayPalScriptProvider>
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
  const className = `w-full border bg-tile px-3.5 py-3 text-sm text-ink ${
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
