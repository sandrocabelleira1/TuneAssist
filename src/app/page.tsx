import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect to the projects page, which will handle authentication
  redirect('/projects');
}
