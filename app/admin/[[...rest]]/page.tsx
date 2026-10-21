// Admin paths that are not built yet (/admin itself is the orders dashboard in B7). Built routes such
// as /admin/health take precedence; everything else is the admin 404, not Next.js's unstyled default.
import { notFound } from "next/navigation";

export default function AdminPending(): never {
  notFound();
}
