import { runDaily } from '@/lib/jobs';
import { cronAllowed } from '@/lib/cron';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response('Unauthorized', { status: 401 });
  try {
    return Response.json({ ok: true, result: await runDaily() });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
