import 'server-only';
import { asActor, type Profile } from './auth';
import { query } from './db';

export type StepKind = 'question' | 'task' | 'guide';
export type Step = {
  id: string;
  kind: StepKind;
  title: string;
  body?: string;
  options?: string[];
  due_days?: number;
};

export type Trigger = 'manual' | 'stage_entered' | 'health_red' | 'deal_created';

export type Playbook = {
  id: string;
  name: string;
  description: string | null;
  category: 'pilot' | 'retention' | 'expansion' | null;
  trigger: Trigger;
  trigger_stage: string | null;
  steps: Step[];
  is_active: boolean;
  runs: number;
  open_runs: number;
  trigger_stage_label: string | null;
};

export type Run = {
  id: string;
  playbook_id: string;
  playbook_name: string;
  steps: Step[];
  status: 'in_progress' | 'completed' | 'dismissed';
  started_via: 'manual' | 'trigger';
  answers: Record<string, string>;
  started_at: string;
  completed_at: string | null;
  started_by_name: string | null;
  tasks: { id: string; title: string; status: string; due_date: string | null; step_title: string }[];
};

const PLAYBOOK_COLS = `p.id, p.name, p.description, p.category, p.trigger, p.trigger_stage, p.steps, p.is_active,
  (select count(*)::int from playbook_runs r where r.playbook_id = p.id) as runs,
  (select count(*)::int from playbook_runs r where r.playbook_id = p.id and r.status = 'in_progress') as open_runs,
  (select s.label from stages s where s.key = p.trigger_stage and (p.category is null or s.category = p.category) limit 1)
    as trigger_stage_label`;

export async function playbookList(me: Profile) {
  return query<Playbook>(asActor(me), `select ${PLAYBOOK_COLS} from playbooks p order by p.is_active desc, p.name`);
}

export async function playbookById(me: Profile, id: string) {
  const rows = await query<Playbook>(asActor(me), `select ${PLAYBOOK_COLS} from playbooks p where p.id = $1`, [id]);
  return rows[0] ?? null;
}

/** Playbooks a person can start on a deal of this category. */
export async function playbooksFor(me: Profile, category: string) {
  return query<{ id: string; name: string; description: string | null }>(
    asActor(me),
    `select id, name, description from playbooks
      where is_active and (category is null or category = $1::deal_category) order by name`,
    [category],
  );
}

export async function runsForDeal(me: Profile, dealId: string) {
  return query<Run>(
    asActor(me),
    `select r.id, r.playbook_id, p.name as playbook_name, p.steps, r.status, r.started_via, r.answers,
            r.started_at, r.completed_at, pr.name as started_by_name,
            coalesce((select json_agg(json_build_object('id', t.id, 'title', t.title, 'status', t.status,
                                                        'due_date', t.due_date, 'step_title', t.title)
                                      order by t.due_date, t.title)
                        from tasks t where t.playbook_run_id = r.id), '[]') as tasks
       from playbook_runs r
       join playbooks p on p.id = r.playbook_id
       left join profiles pr on pr.id = r.started_by
      where r.deal_id = $1 and r.status <> 'dismissed'
      order by (r.status = 'in_progress') desc, r.started_at desc`,
    [dealId],
  );
}

export function describeTrigger(p: Pick<Playbook, 'trigger' | 'trigger_stage_label' | 'trigger_stage' | 'category'>) {
  const deal = p.category ? `${p.category === 'expansion' ? 'an' : 'a'} ${p.category} deal` : 'a deal';
  switch (p.trigger) {
    case 'stage_entered':
      return `When ${deal} enters ${p.trigger_stage_label ?? p.trigger_stage}`;
    case 'health_red':
      return `When ${deal} turns red`;
    case 'deal_created':
      return `When ${deal} is created`;
    default:
      return 'Started by hand from a deal';
  }
}
