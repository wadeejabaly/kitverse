import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { routing, getDir } from "@/i18n/config";
import { FONT_STACK_VARS } from "@/lib/fonts";
import { alternatesFor, getSiteUrl } from "@/lib/site";
import { ConsentProvider } from "@/components/providers/ConsentProvider";
import { CartProvider } from "@/components/cart/CartProvider";
import { ConsentBanner } from "@/components/shared/ConsentBanner";
import { Footer } from "@/components/shared/Footer";
import { Header } from "@/components/shared/Header";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    // Every absolute URL derives from getSiteUrl() — never a literal.
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: t("title"),
      template: `%s — ${t("title")}`,
    },
    description: t("description"),
    // Localized metadata + hreflang alternates — the multilingual SEO promise.
    alternates: alternatesFor(locale),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    // lang + dir are set per locale; the font stacks come from src/lib/fonts.ts
    // as custom properties, and globals.css picks the Arabic stack off `lang`.
    <html lang={locale} dir={getDir(locale)} style={FONT_STACK_VARS}>
      <body className="flex min-h-dvh flex-col bg-ground text-ink">
        <NextIntlClientProvider messages={messages}>
          <ConsentProvider>
            {/* The cart wraps the whole locale tree: the header's live count
                and the cart page read the same provider, so adding a shirt on
                a PDP updates the header without a reload. */}
            <CartProvider>
              <Header />
              <main className="flex grow flex-col">{children}</main>
              <Footer />
            </CartProvider>
            <ConsentBanner />
          </ConsentProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
