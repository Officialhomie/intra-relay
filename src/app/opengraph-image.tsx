import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Generated Open Graph / Twitter card. Uses the "calm clinic" palette from
 * src/styles/tokens.css so link previews match the product.
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
        backgroundColor: "#fffefc",
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            backgroundColor: "#0f3e17",
          }}
        />
        <div style={{ fontSize: "34px", fontWeight: 700, color: "#17201a" }}>{site.name}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div
          style={{
            fontSize: "62px",
            fontWeight: 700,
            lineHeight: 1.1,
            color: "#17201a",
            maxWidth: "1000px",
          }}
        >
          {site.tagline}
        </div>
        <div style={{ fontSize: "28px", color: "#55605a", maxWidth: "940px", lineHeight: 1.4 }}>
          A structured brief in, a genuine printer quote out, a human-approved WhatsApp handoff.
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {["No fund custody", "Human-approved orders", "Celo x402 query fees"].map((chip) => (
          <div
            key={chip}
            style={{
              fontSize: "22px",
              color: "#0f3e17",
              backgroundColor: "#e1f4df",
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
