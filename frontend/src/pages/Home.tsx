import { Link } from "react-router-dom";

export default function Home() {
  return (
    <main className="p-8 space-y-4">
      <h1 className="font-headline-lg text-headline-lg">Patent Drafter</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        Choose a workflow to get started.
      </p>
      <div className="flex gap-4">
        <Link to="/" className="text-secondary underline">
          Patent draft
        </Link>
        <Link to="/grant" className="text-secondary underline">
          Grant application
        </Link>
      </div>
    </main>
  );
}
