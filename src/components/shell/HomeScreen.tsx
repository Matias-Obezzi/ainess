// The first screen: a box asking what you want done, and what the last fortnight cost.
//
// It used to be a dashboard — what needed you, what was running, what had just finished, every
// project as a row — and all of that is reachable from somewhere that belongs to it. The sidebar
// holds the projects and the button that makes one; `ApprovalsPanel` sits above this and keeps
// showing what is held; the bell and the taskbar say when something wants an answer. What was left
// here was a second copy of all of it, in the place where the one thing you cannot do anywhere else
// is start.
//
// So: the box, in the middle, and nothing above it. The usage below it is the one number the app
// has that no other screen adds up across projects.
import { HomeComposer } from "@/components/shell/HomeComposer";
import { HomeUsage } from "@/components/shell/HomeUsage";
import { useT } from "@/i18n/useT";

export function HomeScreen() {
  const t = useT();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* One column down the middle. Full width, the box stretched across a desktop monitor into a
          letterbox nobody wants to write a paragraph into. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-8">

        {/* The whole first screen. Opening the app asks what you want done; it does not report. */}
        <div className="flex min-h-[72vh] flex-col justify-center gap-4">
          <h2 className="text-center text-2xl font-bold">{t("home.greeting")}</h2>
          <HomeComposer />
        </div>

        <HomeUsage />
      </div>
    </div>
  );
}
