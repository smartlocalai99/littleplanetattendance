import { useState } from "react";

// Simple N-step onboarding walkthrough. Reuses the same overlay/card visual
// language as the existing Edit Staff modal (fixed backdrop + rounded white
// card) so it fits the app's existing design language rather than
// introducing a new pattern.
export default function TutorialOverlay({ steps, onDismiss }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          {Icon ? <Icon className="h-7 w-7" aria-hidden="true" /> : null}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          {steps.map((_, index) => (
            <span
              key={index}
              className={`h-2 rounded-full transition-all ${
                index === stepIndex ? "w-6 bg-emerald-600" : "w-2 bg-slate-200"
              }`}
            />
          ))}
        </div>

        <h2 className="mt-5 text-xl font-black text-slate-900">{step.title}</h2>
        <p className="mt-2 text-sm font-semibold text-slate-500">{step.description}</p>

        <div className="mt-6 flex items-center gap-3">
          {!isLastStep ? (
            <button
              type="button"
              onClick={onDismiss}
              className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-600"
            >
              Skip
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (isLastStep) {
                onDismiss();
              } else {
                setStepIndex((index) => index + 1);
              }
            }}
            className="flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-lg transition active:scale-[0.98]"
          >
            {isLastStep ? "Got It" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
