import { redirect } from "next/navigation";

// The real schedule is the day-by-day sessions curriculum. The sidebar "Schedule"
// item points straight there; this route is kept only as a redirect so any old
// /schedule links or bookmarks resolve to the real page instead of a dead stub.
export default function SchedulePage() {
  redirect("/learn/lessons/days");
}
