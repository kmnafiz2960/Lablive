'use client';

// app/teacher/session/[id]/report/page.js
// Route for the session report. The [id] is read with useParams().

import { Suspense } from 'react';
import Report from '@/components/teacher/Report';

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
          Loading report…
        </main>
      }
    >
      <Report />
    </Suspense>
  );
}
