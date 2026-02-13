"use client";
import ShinyText from "@/components/ShinyText";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/clerk-react";
import { useState } from "react";

const Pricing = () => {
  const router = useRouter();
  const { user } = useUser();
  return (
    <section
      id="pricing"
      className="container mx-auto px-4 sm:px-6 py-12 sm:py-20 max-w-5xl"
    >
      <div className="text-center mb-8 sm:mb-12">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3 text-slate-900">
          Simple pricing
        </h2>
        <p className="text-sm sm:text-base text-slate-600">
          Free for everyone
        </p>
      </div>

      <div className="grid sm:grid-cols-1 gap-4 sm:gap-6 max-w-md mx-auto">
        {/* Free Tier */}
        <div className="p-6 sm:p-8 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all">
          <div className="mb-6">
            <h3 className="text-lg sm:text-xl font-semibold mb-2 text-slate-900">
              Free
            </h3>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-bold text-slate-900">
                $0
              </span>
              <span className="text-slate-600 text-xs sm:text-sm">forever</span>
            </div>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full py-2.5 mb-6 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors text-xs sm:text-sm"
          >
            Get started
          </button>

          <ul className="space-y-2.5 sm:space-y-3 text-xs sm:text-sm">
            {["Unlimited uploads", "AI-powered Q&A", "Smart notes", "Audio/video transcription"].map(
              (item) => (
                <li key={item} className="flex items-center gap-2 text-slate-700">
                  <svg
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 flex-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span>{item}</span>
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
