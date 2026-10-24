import { setPassword } from "../actions";
import { input } from "../ui";

export const metadata = { title: "Choose a password" };

/** Reached from the invite email (after /admin/auth/callback signs the user in). */
export default async function SetPassword({ searchParams }: PageProps<"/admin/set-password">) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a password</h1>
        <p className="mt-1 text-sm text-muted">At least 10 characters. You&apos;ll use it to sign in to the admin.</p>
        {sp.error ? <p className="mt-4 rounded-xl bg-red-soft px-3 py-2 text-sm text-red">{sp.error === "short" ? "Use at least 10 characters." : "That didn't work - try again."}</p> : null}
        <form action={setPassword} className="mt-6 flex flex-col gap-3">
          <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="New password" className={`${input} h-11`} />
          <button className="h-11 rounded-lg bg-pitch-fill text-sm font-medium text-white hover:bg-pitch-fill-2">Save and continue</button>
        </form>
      </div>
    </main>
  );
}
