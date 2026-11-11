import { redirect } from 'next/navigation';

/** The pipeline is the front door. There is no separate home screen. */
export default function Index() {
  redirect('/deals');
}
