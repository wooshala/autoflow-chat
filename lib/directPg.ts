import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool | null {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    null;
  if (!connectionString) return null;
  if (pool) return pool;
  pool = new Pool({ connectionString, max: 2 });
  return pool;
}

export async function directSqlTopChatMessages(limit: number): Promise<
  { id: string; created_at: string }[] | null
> {
  const p = getPool();
  if (!p) return null;
  const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 50, 200));
  const result = await p.query<{ id: string; created_at: string }>(
    `
      select id::text as id, created_at::text as created_at
      from public.chat_messages
      order by created_at desc
      limit $1
    `,
    [safeLimit]
  );
  return result.rows || [];
}

