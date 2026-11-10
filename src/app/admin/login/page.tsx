import { signIn } from "../actions";
import { input, Wordmark } from "../ui";
import { SubmitButton } from "../submit-button";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  const error = sp.error === "not_staff" ? "This account doesn't have admin access." : sp.error === "link" ? "That link expired. Ask for a new invite." : sp.error ? "Wrong email or password." : null;
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="kv-card w-full max-w-sm p-7 sm:p-8">
        <div className="mb-8"><Wordmark /></div>
        <div className="kv-eyebrow mb-1.5">Owner console</div>
        <h1 className="kv-display text-[28px] font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Use the email your invite was sent to.</p>
        {error ? <p className="mt-4 rounded-xl bg-red-soft px-3 py-2 text-sm text-red">{error}</p> : null}
        <form action={signIn} className="mt-6 flex flex-col gap-3">
          <input name="email" type="email" required autoComplete="email" placeholder="Email" className={`${input} h-11`} />
          <input name="password" type="password" required autoComplete="current-password" placeholder="Password" className={`${input} h-11`} />
          <SubmitButton className="mt-1 h-11" pendingText="Signing in…">Sign in</SubmitButton>
        </form>
      </div>
    </main>
  );
}
