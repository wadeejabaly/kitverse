/**
 * A small in-memory stand-in for the parts of the Supabase query builder the
 * order/payment code uses (select / insert / update with eq, neq, in, not-in,
 * is, order, limit, single, maybeSingle), plus unique indexes - enough to run
 * whole payment flows in a unit test without a database. Not a general fake.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export type FakeDb = ReturnType<typeof createFakeDb>;

export function createFakeDb(opts: { unique?: Record<string, { cols: string[]; where?: (r: Row) => boolean }[]> } = {}) {
  const tables: Record<string, Row[]> = {};
  const storage: Record<string, Uint8Array> = {};
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const t = (name: string) => (tables[name] ??= []);

  function violates(table: string, row: Row, ignore?: Row) {
    for (const u of opts.unique?.[table] ?? []) {
      if (u.where && !u.where(row)) continue;
      if (u.cols.some((c) => row[c] == null)) continue;
      if (t(table).some((r) => r !== ignore && (!u.where || u.where(r)) && u.cols.every((c) => r[c] === row[c]))) return true;
    }
    return false;
  }

  function query(table: string) {
    const filters: Filter[] = [];
    let mode: "select" | "update" | "insert" = "select";
    let patch: Row = {};
    let inserts: Row[] = [];
    let limit = Infinity;
    let orderBy: { col: string; asc: boolean } | null = null;
    let one: "single" | "maybe" | null = null;
    let head = false;

    const run = () => {
      if (mode === "insert") {
        const out: Row[] = [];
        for (const r of inserts) {
          const row = { id: id(), created_at: new Date(Date.now() + seq).toISOString(), ...r };
          if (violates(table, row)) return { data: null, error: { message: `duplicate key value violates unique constraint on ${table}` } };
          t(table).push(row);
          out.push(row);
        }
        return finish(out);
      }
      let rows = t(table).filter((r) => filters.every((f) => f(r)));
      if (mode === "update") {
        for (const r of rows) {
          const next = { ...r, ...patch };
          if (violates(table, next, r)) return { data: null, error: { message: "duplicate key" } };
          Object.assign(r, patch);
        }
        return finish(rows.map((r) => ({ ...r })));
      }
      if (orderBy) {
        const { col, asc } = orderBy;
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      return finish(rows.slice(0, limit).map((r) => ({ ...r })));
    };
    const finish = (rows: Row[]) => {
      if (head) return { data: null, count: rows.length, error: null };
      if (one === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected one row, got ${rows.length}` } };
      if (one === "maybe") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    };

    const b = {
      select: (_cols?: string, o?: { head?: boolean }) => { head = !!o?.head; return b; },
      insert: (r: Row | Row[]) => { mode = "insert"; inserts = Array.isArray(r) ? r : [r]; return b; },
      update: (p: Row) => { mode = "update"; patch = p; return b; },
      upsert: (r: Row) => { mode = "insert"; inserts = [r]; return b; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b; },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b; },
      is: (c: string, v: null) => { filters.push((r) => (r[c] ?? null) === v); return b; },
      not: (c: string, op: string, list: string) => {
        if (op !== "in") throw new Error("fake db: only not-in");
        const vals = list.replace(/[()]/g, "").split(",");
        filters.push((r) => !vals.includes(String(r[c])));
        return b;
      },
      gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return b; },
      order: (col: string, o?: { ascending?: boolean }) => { orderBy = { col, asc: o?.ascending !== false }; return b; },
      limit: (n: number) => { limit = n; return b; },
      single: () => { one = "single"; return b; },
      maybeSingle: () => { one = "maybe"; return b; },
      then: <T>(res: (v: ReturnType<typeof run>) => T, rej?: (e: unknown) => T) => Promise.resolve().then(run).then(res, rej),
    };
    return b;
  }

  const client = {
    from: query,
    rpc: async () => ({ data: null, error: null }),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array) => {
          const key = `${bucket}/${path}`;
          if (storage[key]) return { data: null, error: { message: "exists" } };
          storage[key] = bytes;
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => { for (const p of paths) delete storage[`${bucket}/${p}`]; return { data: null, error: null }; },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed.example/${bucket}/${path}` }, error: null }),
      }),
    },
  };
  return { client, tables, storage, t, id };
}
