import type { ReactNode, SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const PlayIcon = (p: P) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z" />
  </Icon>
);
export const PauseIcon = (p: P) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <rect x="6.5" y="5" width="3.8" height="14" rx="1.2" />
    <rect x="13.7" y="5" width="3.8" height="14" rx="1.2" />
  </Icon>
);
export const MicIcon = (p: P) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Icon>
);
export const MicOffIcon = (p: P) => (
  <Icon {...p}>
    <g opacity={0.5}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </g>
    <path d="M4 4L20 20" />
  </Icon>
);

export const HeadphonesIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
    <rect x="3.5" y="14" width="4" height="6" rx="1.6" />
    <rect x="16.5" y="14" width="4" height="6" rx="1.6" />
  </Icon>
);
export const HeadphonesOffIcon = (p: P) => (
  <Icon {...p}>
    <g opacity={0.5}>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3.5" y="14" width="4" height="6" rx="1.6" />
      <rect x="16.5" y="14" width="4" height="6" rx="1.6" />
    </g>
    <path d="M4 4L20 20" />
  </Icon>
);

export const ScreenIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="12.5" rx="2.4" />
    <path d="M8 20.5h8M12 16.5v4" />
  </Icon>
);
export const LeaveIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3M15 8l4 4-4 4M19 12H9.5" />
  </Icon>
);
export const VolumeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 9.5v5h3.5l4.5 3.8V5.7L7.5 9.5H4Z" fill="currentColor" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Icon>
);
export const VolumeOffIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 9.5v5h3.5l4.5 3.8V5.7L7.5 9.5H4Z" fill="currentColor" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </Icon>
);
export const FullscreenIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </Icon>
);
export const PlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const LinkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />
  </Icon>
);
export const CheckIcon = (p: P) => (
  <Icon {...p} strokeWidth={2.4}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const MoreIcon = (p: P) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <circle cx="5.5" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="18.5" cy="12" r="1.7" />
  </Icon>
);
export const CrownIcon = (p: P) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M3.5 8l4.2 3.6L12 5l4.3 6.6L20.5 8l-1.6 9.5H5.1L3.5 8Z" />
  </Icon>
);
export const TrashIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 7h15M10 7V5h4v2M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10 11v6M14 11v6" />
  </Icon>
);
export const BroadcastIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
  </Icon>
);
export const ChatIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
  </Icon>
);
export const PeopleIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3 19.5c.5-3.2 3-5 6-5s5.5 1.8 6 5M16 5.6a3.2 3.2 0 0 1 0 5.8M18 14.8c1.7.7 2.8 2.2 3 4.7" />
  </Icon>
);
export const FilmIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.6" />
    <path d="M10.2 9.2v5.6l4.6-2.8-4.6-2.8Z" fill="currentColor" />
  </Icon>
);
export const SyncIcon = (p: P) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 0 0-14.3-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.3L20 15.5M20 20v-4.5h-4.5" />
  </Icon>
);
export const TvIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="12.5" rx="2.4" />
    <path d="M8.5 21h7M12 17.5V21" />
  </Icon>
);
export const GearIcon = (p: P) => (
  <Icon {...p} strokeWidth={1.6}>
    <path d="M9.98 5.40 L10.39 2.84 L13.61 2.84 L14.02 5.40 L15.24 5.91 L17.33 4.38 L19.62 6.67 L18.09 8.76 L18.60 9.98 L21.16 10.39 L21.16 13.61 L18.60 14.02 L18.09 15.24 L19.62 17.33 L17.33 19.62 L15.24 18.09 L14.02 18.60 L13.61 21.16 L10.39 21.16 L9.98 18.60 L8.76 18.09 L6.67 19.62 L4.38 17.33 L5.91 15.24 L5.40 14.02 L2.84 13.61 L2.84 10.39 L5.40 9.98 L5.91 8.76 L4.38 6.67 L6.67 4.38 L8.76 5.91Z" />
    <circle cx="12" cy="12" r="2.9" />
  </Icon>
);
export const AirPlayIcon = (p: P) => (
  <Icon {...p}>
    <path d="M7 17H5.5A2.5 2.5 0 0 1 3 14.5v-8A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v8a2.5 2.5 0 0 1-2.5 2.5H17" />
    <path d="M12 14.5 17 21H7l5-6.5Z" fill="currentColor" />
  </Icon>
);
export const ChevronUpIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 14.5l6-6 6 6" />
  </Icon>
);
export const ChevronDownIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Icon>
);
export const ChevronLeftIcon = (p: P) => (
  <Icon {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Icon>
);
export const QueueNextIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h11M4 12h7M4 17h7" />
    <path d="M16 13.5v6l5-3-5-3Z" fill="currentColor" />
  </Icon>
);
export const CaptionsIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3.2" />
    <path d="M10.4 10.2a2.4 2.4 0 1 0 0 3.6M17.4 10.2a2.4 2.4 0 1 0 0 3.6" />
  </Icon>
);
export const SidebarIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="3.2" />
    <path d="M15 4.5v15" />
  </Icon>
);
export const PlaylistIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h11M4 12h11M4 17h6" />
    <path d="M18 14.5v5l4-2.5-4-2.5Z" fill="currentColor" />
  </Icon>
);
export const FitIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M9 12h6M9 12l1.6-1.6M9 12l1.6 1.6M15 12l-1.6-1.6M15 12l-1.6 1.6" />
  </Icon>
);
export const FillIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
    <rect x="8" y="9" width="8" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
  </Icon>
);
