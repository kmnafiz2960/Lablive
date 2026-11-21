'use client';

// app/teacher/session/[id]/student/[participantId]/page.js
// Route for one student's full code and teacher notes.

import { Suspense } from 'react';
import StudentDetail from '@/components/teacher/StudentDetail';

export default function StudentPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
          Loading student…
        </main>
      }
    >
      <StudentDetail />
    </Suspense>
  );
}
