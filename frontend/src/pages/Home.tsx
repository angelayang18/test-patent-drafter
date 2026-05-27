import { Link } from "react-router-dom";
import UploadPanel from "../components/UploadPanel";

export default function Home() {
  return (
    <main>
      <h1>Patent Drafter</h1>
      <UploadPanel />
      <Link to="/draft">Start draft</Link>
    </main>
  );
}
