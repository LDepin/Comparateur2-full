// src/app/page.tsx (server component)
import { redirect } from "next/navigation";

export const revalidate = 0;

export default function Home() {
  redirect("/search");
}