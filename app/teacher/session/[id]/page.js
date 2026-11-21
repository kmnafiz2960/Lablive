'use client';

// app/teacher/session/[id]/page.js
// Route for the live grid. The grid reads [id] with useParams().

import { Suspense } from 'react';
import LiveGrid from '@/components/teacher/LiveGrid';

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
          Loading grid…
        </main>
      }
    >
      <LiveGrid />
    </Suspense>
  );
}
