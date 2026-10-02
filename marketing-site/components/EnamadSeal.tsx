"use client";

import { useState } from "react";

const ENAMAD_URL =
  "https://trustseal.enamad.ir/?id=7725036&Code=1gRZidzuNJ5K2siWGPaxP8PU4nYfEbOX";
const ENAMAD_LOGO =
  "https://trustseal.enamad.ir/logo.aspx?id=7725036&Code=1gRZidzuNJ5K2siWGPaxP8PU4nYfEbOX";
const ENAMAD_CODE = "1gRZidzuNJ5K2siWGPaxP8PU4nYfEbOX";

/**
 * ENAMAD trust seal.
 * stage 0: official ENAMAD logo (exact attributes their validator checks)
 * stage 1: self-hosted copy at /enamad-seal.png (drop the file in public/ to enable)
 * stage 2: built-in badge — footer never shows an empty gap
 */
export default function EnamadSeal() {
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  return (
    <a
      {...({ referrerpolicy: "origin" } as Record<string, string>)}
      target="_blank"
      rel="noopener noreferrer"
      href={ENAMAD_URL}
      aria-label="نماد اعتماد الکترونیکی"
      className="inline-flex shrink-0"
    >
      {stage < 2 ? (
        <img
          {...({ referrerpolicy: "origin", code: ENAMAD_CODE } as Record<string, string>)}
          src={stage === 0 ? ENAMAD_LOGO : "/enamad-seal.png"}
          alt=""
          style={{ cursor: "pointer" }}
          className="h-16 w-auto"
          onError={() => setStage((s) => (s === 0 ? 1 : 2))}
        />
      ) : (
        <span className="flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-1 text-center">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-emerald-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span className="text-[8px] font-medium leading-tight text-mist-300">
            نماد اعتماد
            <br />
            الکترونیکی
          </span>
        </span>
      )}
    </a>
  );
}
