/**
 * Which payment methods checkout actually offers right now — the SAME
 * env-var tests the checkout page uses for its buttons (see
 * src/app/[locale]/checkout/page.tsx), so the footer, the Help answers and
 * the product page never advertise a method that checkout would not show
 * (as of 2026-11-09 only cash on delivery is configured in production;
 * PayPal and Bit appear the moment their env vars are set).
 */
export function enabledPaymentMethods(): { cash: boolean; paypal: boolean; bit: boolean } {
  return {
    cash: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    paypal: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET),
    bit: !!(
      process.env.PAYPLUS_API_KEY &&
      process.env.PAYPLUS_SECRET_KEY &&
      process.env.PAYPLUS_PAYMENT_PAGE_UID
    ),
  };
}
