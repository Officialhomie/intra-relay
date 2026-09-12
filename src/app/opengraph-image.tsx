import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Generated Open Graph / Twitter card. Uses the current ink-on-ivory palette
 * from src/styles/tokens.css so link previews match the product (ADR-022).
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: "#faf9f5",
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <svg width="44" height="44" viewBox="0 0 32 32">
          <circle cx="9.5" cy="16" r="4.8" fill="#1f1e1d" />
          <circle cx="22.5" cy="16" r="4.8" fill="none" stroke="#1f1e1d" strokeWidth="2.6" />
          <line x1="14" y1="16" x2="18" y2="16" stroke="#1f1e1d" strokeWidth="2.6" />
        </svg>
        <div style={{ fontSize: "34px", fontWeight: 700, color: "#141413" }}>{site.name}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div
          style={{
            fontSize: "62px",
            fontWeight: 700,
            lineHeight: 1.1,
            color: "#141413",
            maxWidth: "1000px",
          }}
        >
          Tell Intra what you need. Get a real price. Keep the final say.
        </div>
        <div style={{ fontSize: "28px", color: "#3d3d3a", maxWidth: "940px", lineHeight: 1.4 }}>
          A structured brief in, a genuine printer quote out, a human-approved WhatsApp handoff.
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {["No fund custody", "Human-approved orders", "Nothing fabricated"].map((chip) => (
          <div
            key={chip}
            style={{
              fontSize: "22px",
              color: "#1f1e1d",
              backgroundColor: "#dfe9df",
              padding: "10px 20px",
              borderRadius: "999px",
            }}
          >
            {chip}
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  );
}
