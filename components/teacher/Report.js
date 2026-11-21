'use client';

// components/teacher/Report.js
// Show the report numbers and keep them fresh every 3 seconds.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { getExport, getReport } from '@/lib/api';
import { STATUS_ORDER } from '@/lib/status';
import StatusBadge from '@/components/teacher/StatusBadge';

const POLL_MS = 3000;

// Put quotes around every CSV field, including the header row.
// Double any quotes that are already inside a field.
function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows) {
  const header = ['Name', 'Student ID', 'Status', 'Minutes to submit', 'Lines', 'Notes'];
  const lines = [header.map(csvCell).join(',')];
  rows.forEach((student) => {
    lines.push(
      [
        student.student_name,
        student.student_code,
        student.status,
        student.minutes_to_submit,
        student.line_count,
        student.notes_count,
      ]
        .map(csvCell)
        .join(',')
    );
  });
  // The BOM makes Excel open the file as UTF-8 instead of guessing.
  return `\uFEFF${lines.join('\r\n')}`;
}

export default function Report() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { loading: authLoading, signOut } = useAuth({ requireRole: 'teacher' });

  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [exportRows, setExportRows] = useState(null);
  const [exportError, setExportError] = useState('');

  // Skip a poll if the previous request is still running.
  const inFlightRef = useRef(false);
  const exportInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await getReport(id);
      setReport(result.report);
      setError('');
    } catch (err) {
      // Keep the last good report instead of flashing an empty page.
      setError(err.message || 'Could not refresh the report.');
    } finally {
      inFlightRef.current = false;
    }
  }, [id]);

  const loadExport = useCallback(async () => {
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;
    try {
      const result = await getExport(id);
      setExportRows(result.students ?? []);
      setExportError('');
    } catch (err) {
      // Keep the last good table instead of flashing an empty one.
      setExportError(err.message || 'Could not load the student list.');
    } finally {
      exportInFlightRef.current = false;
    }
  }, [id]);

  useEffect(() => {
    if (authLoading || !id) return;
    const first = setTimeout(() => {
      load();
      loadExport();
    }, 0);
    const timer = setInterval(() => {
      load();
      loadExport();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [authLoading, id, load, loadExport]);

  function handleDownload() {
    if (!exportRows) return;
    const csv = buildCsv(exportRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lablive-report-${id}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // Loading and error states.
  if (!id) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        This report link is missing an id.
      </main>
    );
  }

  if (authLoading || (!report && !error)) {
    return (
      <main className="flex flex-1 items-center justify-center p-8 text-zinc-500">
        Loading report…
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Could not load the report
        </h1>
        <p role="alert" className="text-red-700 dark:text-red-300">
          {error}
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={load}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Try again
          </button>
          <Link href={`/teacher/session/${id}`} className="py-2 text-indigo-600 hover:underline">
            Back to grid
          </Link>
        </div>
      </main>
    );
  }

  const counts = report.status_counts ?? {};
  const average =
    report.avg_minutes_to_submit == null
      ? 'none yet'
      : `${report.avg_minutes_to_submit} min`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600">LabLive · Report</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Session report
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Refreshes every 3 seconds</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!exportRows}
            className="rounded-lg border border-zinc-300 px-4 py-2 font-semibold text-zinc-700 transition-colors hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
          >
            Download CSV
          </button>
          <Link
            href={`/teacher/session/${id}`}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            Back to grid
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="px-2 py-1 text-sm text-zinc-500 hover:text-indigo-600 hover:underline"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
        >
          Refresh failed: {error} The last report is still shown.
        </p>
      )}

      {/* Empty: nobody has joined this session. */}
      {report.total_students === 0 && (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            No students yet
          </h2>
          <p className="mt-2 text-zinc-500">
            Share the join code to bring students into this session.
          </p>
        </section>
      )}

      <section aria-label="Report numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Total students</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            {report.total_students ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Submitted</p>
          <p className="mt-1 text-3xl font-bold text-blue-700 dark:text-blue-300">
            {report.submitted ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Not submitted</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            {report.not_submitted ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Hands raised now</p>
          <p className="mt-1 text-3xl font-bold text-yellow-700 dark:text-yellow-300">
            {report.hands_raised_now ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">Average minutes to submit</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">{average}</p>
        </div>
      </section>

      <section
        aria-labelledby="status-counts-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 id="status-counts-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Status counts
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {STATUS_ORDER.map((status) => (
            <li
              key={status}
              className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-950"
            >
              <StatusBadge status={status} />
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {counts[status] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="export-heading"
        className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="export-heading" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Student results
          </h2>
          {exportRows === null && !exportError && (
            <p className="text-sm text-zinc-500">Loading students…</p>
          )}
        </div>

        {exportError && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
          >
            Student list refresh problem: {exportError} The last table is still shown.
          </p>
        )}

        {exportRows?.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500">No students in the export yet.</p>
        )}

        {exportRows && exportRows.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Student ID</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Minutes to submit</th>
                  <th className="px-3 py-2">Lines</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {exportRows.map((student) => (
                  <tr
                    key={student.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-50">
                      {student.student_name || 'Unknown student'}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {student.student_code || '—'}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {student.status || '—'}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {student.minutes_to_submit ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {student.line_count ?? 0}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {student.notes_count ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
