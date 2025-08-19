/**
 * App shell and routing.
 * Keeps navigation minimal per the spec (Study + Admin).
 */

import { BrowserRouter, Link, Route, Routes, Navigate } from "react-router-dom";
import Admin from "./pages/Admin";
import Study from "./pages/Study";
import Status from "./pages/Status";


export default function App() {
  return (
    <BrowserRouter>
      <nav className="border-b p-3 flex gap-3">
        <Link to="/study" className="font-medium">Study</Link>
        <Link to="/admin" className="font-medium">Admin</Link>
        <Link to="/status" className="font-medium">Status</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/study" replace />} />
        <Route path="/study" element={<Study />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/status" element={<Status />} />
        <Route path="*" element={<div className="p-4">Not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
