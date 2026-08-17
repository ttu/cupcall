import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';

export default function DemoPage(): ReactElement {
  redirect('/view/demo-completed');
}
