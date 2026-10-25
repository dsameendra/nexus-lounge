export const AVATARS = ["star", "bolt", "moon", "heart", "wave", "diamond", "ring", "triangle", "leaf", "flame", "play", "hex"] as const;

export const avatarPath = (id: string) => `/avatars/${id}.svg`;

export function isPresetAvatar(value: string) {
  return AVATARS.some((id) => avatarPath(id) === value);
}
