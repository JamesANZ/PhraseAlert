import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#070b16",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 124,
          height: 124,
          borderRadius: 28,
          background: "#111c33",
          border: "3px solid #273858",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 82,
            height: 3,
            borderRadius: 3,
            background: "#8197ff",
            transform: "rotate(-13deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 28,
            height: 28,
            borderRadius: 14,
            background: "#8197ff",
            boxShadow: "0 0 0 16px rgba(129, 151, 255, 0.18)",
          }}
        />
      </div>
    </div>,
    { ...size },
  );
}
