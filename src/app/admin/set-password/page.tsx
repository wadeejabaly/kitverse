import { setPassword } from "../actions";
import { input, Wordmark } from "../ui";
import { SubmitButton } from "../submit-button";

export const metadata = { title: "Choose a password" };

/** Reached from the invite email (after /admin/auth/callback signs the user in). */
export default async function SetPassword({ searchParams }: PageProps<"/admin/set-password">) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="kv-card w-full max-w-sm p-7 sm:p-8">
        <div className="mb-8"><Wordmark /></div>
        <h1 className="kv-display text-[26px] font-bold">Choose a password</h1>
        <p className="mt-1 text-sm text-muted">At least 10 characters. You&apos;ll use it to sign in to the admin.</p>
        {sp.error ? <p className="mt-4 rounded-xl bg-red-soft px-3 py-2 text-sm text-red">{sp.error === "short" ? "Use at least 10 characters." : "That didn't work - try again."}</p> : null}
        <form action={setPassword} className="mt-6 flex flex-col gap-3">
          <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="New password" className={`${input} h-11`} />
          <SubmitButton className="h-11" pendingText="Saving…">Save and continue</SubmitButton>
        </form>
      </div>
    </main>
  );
}
