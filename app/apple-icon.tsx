import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#15181d",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* handle */}
        <div
          style={{
            width: 18,
            height: 14,
            border: "6px solid #d4ad5a",
            borderBottom: "none",
            borderRadius: "18px 18px 0 0",
            marginBottom: -2,
          }}
        />
        {/* crown */}
        <div
          style={{
            width: 28,
            height: 12,
            background: "#d4ad5a",
            borderRadius: 6,
            marginBottom: -1,
          }}
        />
        {/* body */}
        <div
          style={{
            width: 88,
            height: 72,
            background: "#d4ad5a",
            borderRadius: "8px 8px 44px 44px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: 10,
          }}
        >
          {/* clapper */}
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              background: "#6bc49a",
              boxShadow: "0 0 0 6px rgba(107, 196, 154, 0.35)",
              marginBottom: -18,
            }}
          />
        </div>
      </div>
    </div>,
    { ...size },
  );
}
