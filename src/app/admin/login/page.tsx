import { signIn } from "../actions";
import { input, Wordmark } from "../ui";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  const error = sp.error === "not_staff" ? "This account doesn't have admin access." : sp.error === "link" ? "That link expired. Ask for a new invite." : sp.error ? "Wrong email or password." : null;
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10"><Wordmark /></div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Use the email your invite was sent to.</p>
        {error ? <p className="mt-4 rounded-xl bg-red-soft px-3 py-2 text-sm text-red">{error}</p> : null}
        <form action={signIn} className="mt-6 flex flex-col gap-3">
          <input name="email" type="email" required autoComplete="email" placeholder="Email" className={`${input} h-11`} />
          <input name="password" type="password" required autoComplete="current-password" placeholder="Password" className={`${input} h-11`} />
          <button className="mt-1 h-11 rounded-lg bg-pitch-fill text-sm font-medium text-white hover:bg-pitch-fill-2">Sign in</button>
        </form>
      </div>
    </main>
  );
}
