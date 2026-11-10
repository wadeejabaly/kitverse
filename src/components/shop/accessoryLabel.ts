import { accessoryTeam, accessoryVariant } from "@/data/accessories";
type T = (key: string, values?: Record<string, string>) => string;
type Labelled = { category: string; team: string; teamAr: string; teamHe?: string; variant?: string; variantAr?: string; variantHe?: string };

/** "Real Madrid Keychain" / "Real Madrid Scarf · Navy & White", in the visitor's language (accessories namespace). */
export function accessoryLabel(t: T, a: Labelled, locale: string): string {
  const team = accessoryTeam(a, locale);
  if (a.category === "scarf") {
    const variant = accessoryVariant(a, locale);
    return variant ? t("scarfTitle", { team, variant }) : t("scarfTitleOnly", { team });
  }
  return t("keychainTitle", { team });
}
