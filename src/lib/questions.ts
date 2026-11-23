import 'server-only';
import { asActor, type Profile } from './auth';
import { query } from './db';

export type QuestionRow = {
  id: string;
  deal_id: string;
  deal_title: string;
  client_name: string;
  anchor: string;
  anchor_note: string | null;
  body: string;
  status: 'open' | 'answered' | 'resolved';
  created_at: string;
  asked_by: string | null;
  asked_to: string | null;
  replies: number;
  last_reply: string | null;
};

/**
  For one person: questions put to them (or to anyone, on deals they own) that
  still need an answer, and questions they asked that are waiting or answered.
*/
export async function questionsFor(me: Profile, personId: string) {
  const rows = await query<QuestionRow & { to_id: string | null; by_id: string | null; owner: string | null }>(
    asActor(me),
    `select q.id, q.deal_id, d.title as deal_title, c.name as client_name, q.anchor, q.anchor_note, q.body,
            q.status, q.created_at, a.name as asked_by, t.name as asked_to, q.asked_to as to_id,
            q.created_by as by_id, d.intern_owner as owner,
            (select count(*)::int from question_replies r where r.question_id = q.id) as replies,
            (select r.body from question_replies r where r.question_id = q.id order by r.created_at desc limit 1) as last_reply
       from questions q
       join deals d on d.id = q.deal_id
       join clients c on c.id = q.client_id
       left join profiles a on a.id = q.created_by
       left join profiles t on t.id = q.asked_to
      where q.status <> 'resolved'
        and (q.asked_to = $1 or q.created_by = $1 or (q.asked_to is null and d.intern_owner = $1))
      order by q.created_at`,
    [personId],
  );
  return {
    toAnswer: rows.filter((r) => r.status === 'open' && r.by_id !== personId && (r.to_id === personId || (!r.to_id && r.owner === personId))),
    asked: rows.filter((r) => r.by_id === personId),
  };
}
