import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { routing, getDir } from "@/i18n/config";
import { FONT_STACK_VARS } from "@/lib/fonts";
import { OG_IMAGE, alternatesFor, getSiteUrl, localeUrl, ogImageUrl } from "@/lib/site";
import { ConsentProvider } from "@/components/providers/ConsentProvider";
import { CartProvider } from "@/components/cart/CartProvider";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { ConsentBanner } from "@/components/shared/ConsentBanner";
import { Footer } from "@/components/shared/Footer";
import { Header } from "@/components/shared/Header";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** OpenGraph wants a territory-tagged locale, not a bare language code. */
const OG_LOCALE: Record<string, string> = { ar: "ar_AR", en: "en_US" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  // The share card is the crest on the site ground — see OG_IMAGE in site.ts.
  // The icons themselves need no entry here: src/app/icon.png and
  // src/app/apple-icon.png are picked up by Next's file convention.
  const image = {
    url: ogImageUrl(),
    width: OG_IMAGE.width,
    height: OG_IMAGE.height,
    type: OG_IMAGE.type,
    alt: t("title"),
  };
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
    openGraph: {
      type: "website",
      siteName: t("title"),
      title: t("title"),
      description: t("description"),
      url: localeUrl(locale),
      locale: OG_LOCALE[locale] ?? locale,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
      images: [image.url],
    },
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
              {/* Renders nothing. Resets scroll on navigation for everyone,
                  and starts smooth scroll on desktop pointer devices only —
                  phones and reduced-motion readers never fetch that chunk. */}
              <MotionProvider />
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
