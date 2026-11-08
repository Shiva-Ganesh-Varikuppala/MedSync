import React from "react";

// The MedSync mark: a two-tone capsule. Reused in the header, on the sign-in screen and as the favicon.
export default function Brand({ size = 28 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g transform="rotate(-40 16 16)">
        <path d="M16 3a7 7 0 0 1 7 7v6H9v-6a7 7 0 0 1 7-7z" fill="var(--indigo)" />
        <path d="M9 16h14v6a7 7 0 0 1-14 0z" fill="var(--coral)" />
        <rect x="12" y="6" width="2.2" height="7" rx="1.1" fill="#fff" opacity=".45" />
      </g>
    </svg>
  );
}
