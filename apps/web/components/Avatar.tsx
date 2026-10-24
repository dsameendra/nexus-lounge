import { participantMetadataSchema } from "@nexus/shared";

export function parseImage(metadata: string | undefined) {
  if (!metadata) return null;
  try {
    return participantMetadataSchema.parse(JSON.parse(metadata)).image;
  } catch {
    return null;
  }
}

export function Avatar({ name, image, className = "size-9" }: { name: string; image: string | null; className?: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={`${className} shrink-0 rounded-full bg-panel-2 object-cover`} />;
  }
  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-panel-3 to-panel-2 text-[0.8em] font-semibold uppercase`}
    >
      {name.slice(0, 1)}
    </span>
  );
}
