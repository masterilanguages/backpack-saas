import { redirect } from "next/navigation";

// The standalone Lessons catalog was folded into the Schedule — every lesson
// now lives inside its session (e.g. Colors + Colors Test are Session 1
// tasks). Old links land on the schedule.
export default function LessonsIndexPage() {
  redirect("/learn/lessons/days");
}
