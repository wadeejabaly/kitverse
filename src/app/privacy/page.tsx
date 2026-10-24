import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy | Kitverse" };

/** Needed for Meta app review (Instagram messaging). Business details: fill in before launch. */
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-stone-800" dir="ltr">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-stone-500">Kitverse | Soccer Jerseys (@kitversejerseys) · Last updated October 2026</p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed">
        <p>When you message us on Instagram we use an automated assistant, supervised by our team, to answer questions and take orders.</p>
        <h2 className="pt-2 font-semibold">What we collect</h2>
        <p>Your Instagram messages, voice notes and photos you send us; your Instagram name and username; and, when you order, your full name, phone number and delivery address, and the items you ordered.</p>
        <h2 className="pt-2 font-semibold">Why</h2>
        <p>To answer you, prepare and deliver your order, contact you about it, issue receipts, and improve our service. We do not sell your data or use it for advertising outside our own Instagram account.</p>
        <h2 className="pt-2 font-semibold">Who processes it</h2>
        <p>Our database host (Supabase, EU), our AI provider (Anthropic) which generates reply drafts, our delivery company (name, phone and address only), and our payment and invoicing providers when you pay online. They process data only to provide these services.</p>
        <h2 className="pt-2 font-semibold">How long</h2>
        <p>Order records are kept as required for tax purposes. Conversations are kept up to 2 years unless you ask us to delete them earlier.</p>
        <h2 className="pt-2 font-semibold">Your rights</h2>
        <p>You can ask to see, correct or delete your data at any time by sending us a message on Instagram (@kitversejerseys).</p>
      </div>
    </main>
  );
}
