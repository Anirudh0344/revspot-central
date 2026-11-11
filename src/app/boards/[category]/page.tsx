import { permanentRedirect } from 'next/navigation';

/** The boards are views of the deal pipeline now, not a module of their own. */
export default async function BoardRedirect({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const known = ['pilot', 'retention', 'expansion'].includes(category);
  permanentRedirect(known ? `/deals?view=${category}` : '/deals');
}
