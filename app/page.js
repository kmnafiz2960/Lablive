// app/page.js
// Public landing page: what LabLive does and where to go next.

import Link from 'next/link';

const features = [
  {
    title: 'Write code in the browser',
    text: 'A simple editor autosaves your work while you type.',
  },
  {
    title: 'Ask for help with one click',
    text: 'Raise a hand and your teacher sees it on their live grid.',
  },
  {
    title: 'Get hints as you go',
    text: 'Teacher notes appear right next to your work.',
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 px-4 py-16 text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">LabLive</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          See who is stuck in your coding lab
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Students write code in the browser. Teachers watch a live grid of progress, spot raised
          hands, and leave hints — no looking over shoulders required.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg border border-zinc-300 px-6 py-3 font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Sign up as a student
        </Link>
      </div>

      <ul className="grid w-full gap-4 text-left sm:grid-cols-3">
        {features.map((feature) => (
          <li
            key={feature.title}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{feature.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{feature.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
