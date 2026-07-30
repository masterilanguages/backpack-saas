import { redirect } from "next/navigation";

// The standalone journal page is gone — the Journal lives inside the home
// phone shell (Practice tab). ?open=journal makes the shell open it directly.
export default function JournalPage() {
  redirect("/home?open=journal");
}
