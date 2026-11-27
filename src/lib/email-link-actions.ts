'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile, asActor, canEdit, VIEW_ONLY_MESSAGE } from './auth';
import { tx, readableError } from './db';
import { clientDomain } from './email-domains';
import type { Result } from './actions';

/*
  The pieces Gmail sync needs to put an email on the right deal:
    - which of the client's people work on which deal (deal contacts)
    - which email domains belong to the client
    - an email attached by hand, whose thread then follows it
  Removals are soft (no DELETE grants), so the activity log keeps who and why.
*/

const fail = (e: unknown): Result => ({ ok: false, error: readableError(e) });

/**
 * Links one of the client's contacts to a deal, then files their unassigned emails
 * on it when this is the only live deal they are linked to.
 */
export async function linkDealContactAction(dealId: string, contactId: string): Promise<Result & { filed?: number }> {
  const me = await requireProfile();
  if (!canEdit(me)) return { ok: false, error: VIEW_ONLY_MESSAGE };
  if (!contactId) return { ok: false, error: 'Pick a contact to link.' };
  try {
    const filed = await tx(asActor(me), 'Contact linked to deal', async (c) => {
      const { rows } = await c.query<{ client_id: string; email: string | null }>(
        `select d.client_id, ct.email from deals d
           join contacts ct on ct.id = $2 and ct.client_id = d.client_id and ct.archived_at is null
          where d.id = $1`,
        [dealId, contactId]);
      if (!rows.length) throw new Error("That contact doesn't belong to this deal's client.");
      await c.query(
        `insert into deal_contacts (deal_id, contact_id) values ($1, $2)
         on conflict (deal_id, contact_id) do update
           set removed_at = null, removed_by = null
         where deal_contacts.removed_at is not null`,
        [dealId, contactId]);

      const email = rows[0].email?.toLowerCase();
      if (!email) return 0;
      // Only when this contact points at exactly one live deal: otherwise which
      // deal an email is about is a guess, and it stays on the client.
      const filedRows = await c.query(
        `update interactions i set deal_id = $1
          where i.deal_id is null and i.client_id = $2 and i.channel = 'email'
            and $3 = any(i.participants)
            and (select count(*) from deal_contacts dc
                   join deal_view dv on dv.id = dc.deal_id
                  where dc.contact_id = $4 and dc.removed_at is null
                    and not dv.stage_is_terminal and dv.archived_at is null) = 1`,
        [dealId, rows[0].client_id, email, contactId]);
      return filedRows.rowCount ?? 0;
    });
    revalidatePath(`/deals/${dealId}`);
    return { ok: true, filed };
  } catch (e) {
    return fail(e);
  }
}

export async function unlinkDealContactAction(dealId: string, contactId: string): Promise<Result> {
  const me = await requireProfile();
  if (!canEdit(me)) return { ok: false, error: VIEW_ONLY_MESSAGE };
  try {
    await tx(asActor(me), 'Contact unlinked from deal', (c) =>
      c.query(
        `update deal_contacts set removed_at = now(), removed_by = app_actor()
          where deal_id = $1 and contact_id = $2 and removed_at is null`,
        [dealId, contactId]));
    revalidatePath(`/deals/${dealId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Adds an email domain, so Gmail sync picks up this client's mail. */
export async function addClientDomainAction(clientId: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  if (!canEdit(me)) return { ok: false, error: VIEW_ONLY_MESSAGE };
  const raw = String(f.get('domain') ?? '');
  const domain = clientDomain(raw, process.env.ALLOWED_EMAIL_DOMAIN);
  if (!domain) {
    return {
      ok: false,
      error: raw.trim()
        ? `"${raw.trim()}" isn't a client domain. Use the part after @ in their work email, e.g. godrejproperties.com (not gmail.com).`
        : 'Enter a domain, e.g. godrejproperties.com.',
    };
  }
  try {
    await tx(asActor(me), 'Email domain added', async (c) => {
      // Sync maps each domain to one client, so a domain can't belong to two.
      const { rows: taken } = await c.query<{ name: string }>(
        `select cl.name from client_domains cd join clients cl on cl.id = cd.client_id
          where cd.domain = $1 and cd.client_id <> $2 and cd.removed_at is null and cl.archived_at is null`,
        [domain, clientId]);
      if (taken.length) throw new Error(`${domain} already belongs to ${taken[0].name}. Remove it there first.`);
      await c.query(
        `insert into client_domains (client_id, domain) values ($1, $2)
         on conflict (client_id, domain) do update set removed_at = null, removed_by = null
         where client_domains.removed_at is not null`,
        [clientId, domain]);
    });
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeClientDomainAction(clientId: string, domainId: string): Promise<Result> {
  const me = await requireProfile();
  if (!canEdit(me)) return { ok: false, error: VIEW_ONLY_MESSAGE };
  try {
    await tx(asActor(me), 'Email domain removed', (c) =>
      c.query(
        `update client_domains set removed_at = now(), removed_by = app_actor()
          where id = $1 and client_id = $2 and removed_at is null`,
        [domainId, clientId]));
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Files an email on one of the client's live deals, with the rest of its thread
 * that isn't on a deal yet. Later replies in the thread follow it (Gmail sync).
 */
export async function attachEmailToDealAction(interactionId: string, dealId: string): Promise<Result & { filed?: number }> {
  const me = await requireProfile();
  if (!canEdit(me)) return { ok: false, error: VIEW_ONLY_MESSAGE };
  if (!dealId) return { ok: false, error: 'Pick a deal.' };
  try {
    const out = await tx(asActor(me), 'Email filed on deal', async (c) => {
      const { rows } = await c.query<{ client_id: string; thread_ref: string | null }>(
        `select i.client_id, i.thread_ref from interactions i
           join deal_view dv on dv.id = $2 and dv.client_id = i.client_id
                            and not dv.stage_is_terminal and dv.archived_at is null
          where i.id = $1`,
        [interactionId, dealId]);
      if (!rows.length) throw new Error("That deal isn't a live deal of this email's client.");
      const res = await c.query(
        `update interactions set deal_id = $2
          where client_id = $3
            and (id = $1 or (deal_id is null and $4::text is not null and thread_ref = $4))`,
        [interactionId, dealId, rows[0].client_id, rows[0].thread_ref]);
      return { clientId: rows[0].client_id, filed: res.rowCount ?? 0 };
    });
    revalidatePath(`/clients/${out.clientId}`);
    revalidatePath(`/deals/${dealId}`);
    return { ok: true, filed: out.filed };
  } catch (e) {
    return fail(e);
  }
}
