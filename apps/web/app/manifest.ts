import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Nexus Lounge",
    short_name: "Nexus",
    description: "Watch streams together with voice chat, synced playback and screen sharing.",
    lang: "en",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["entertainment", "social"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      { src: "/screenshots/desktop.png", sizes: "1280x800", type: "image/png", form_factor: "wide", label: "Watch together with voice and chat" },
      { src: "/screenshots/mobile.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Everything fits on your phone" },
    ],
    shortcuts: [{ name: "Join a room", short_name: "Join", description: "Enter a room code", url: "/#join", icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png" }] }],
  };
}
