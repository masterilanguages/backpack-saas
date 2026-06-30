"use client";

import { redirect } from "next/navigation";

// "Learn" was merged into the "Library" page (formerly "Media") since both
// pages browsed/played the same video catalog with an interactive transcript.
export default function LearnPage() {
  redirect("/media");
}
