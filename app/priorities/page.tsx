import { permanentRedirect } from "next/navigation";
// The account-based priority list became the browser-stored shortlist.
export default function Page() {
  permanentRedirect("/shortlist");
}
