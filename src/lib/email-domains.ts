/** Mail providers anyone can sign up to: their domain says nothing about the client. */
export const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'yahoo.co.in',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'rediffmail.com', 'zoho.com',
]);

const SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * 'Priya@GodrejProperties.com', '@godrejproperties.com', 'https://www.godrejproperties.com/'
 * -> 'godrejproperties.com'. Null when it is not a usable client domain.
 */
export function clientDomain(input: string | null | undefined, internal = 'revspot.ai'): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  if (d.includes('@')) d = d.slice(d.lastIndexOf('@') + 1);
  d = d.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:\s>]/)[0].replace(/\.$/, '');
  if (!SHAPE.test(d) || FREE_MAIL.has(d) || d === internal.toLowerCase()) return null;
  return d;
}
