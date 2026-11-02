import { TrackForm } from "./track-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "تتبع طلبيتك · Kitverse", robots: { index: false, follow: false } };

/**
 * Self-serve order lookup (owner request 2026-11-03): Instagram customers never get the signed
 * /o/<token> link a website checkout hands out. Phone number plus the order number (or the email on
 * the order) finds it and opens that same live order page. The lookup runs in ./actions.ts as a form
 * POST, with failed tries rate-limited (owner correction 2026-11-03: email, not name, as 2nd field).
 */
export default function TrackPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span dir="ltr" className="text-[20px] font-black uppercase leading-none tracking-[-0.04em]">Kitverse</span>
      </header>

      <section className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-bold leading-tight">تتبع طلبيتك</h1>
        <p className="text-sm text-muted">دخل رقم موبايلك ورقم الطلبية، أو الإيميل اللي كتبته وقت الطلب، ومنوريك وين وصلت.</p>
      </section>

      <TrackForm />

      <a href="https://ig.me/m/kitversejerseys" className="mt-2 flex items-center justify-center gap-2 rounded-md border border-line py-3 text-sm font-medium text-ink-2 active:scale-[.99]">
        ما لقيت طلبيتك؟ راسلنا عالانستغرام
      </a>
    </main>
  );
}
