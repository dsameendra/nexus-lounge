const NAMED: Record<string, string> = {
  Space: "Space",
  ShiftLeft: "Left Shift",
  ShiftRight: "Right Shift",
  ControlLeft: "Left Control",
  ControlRight: "Right Control",
  AltLeft: "Left Option",
  AltRight: "Right Option",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  CapsLock: "Caps Lock",
  Tab: "Tab",
  Enter: "Enter",
};

export function keyLabel(code: string) {
  if (NAMED[code]) return NAMED[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Arrow/.test(code)) return `${code.slice(5)} arrow`;
  return code;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isTypingTarget(tagName: string | undefined, isContentEditable: boolean) {
  return isContentEditable || (tagName !== undefined && TYPING_TAGS.has(tagName.toUpperCase()));
}

const RESERVED = new Set(["Escape", "Tab", "Enter", "Backspace", "MetaLeft", "MetaRight"]);

export function isAllowedPttKey(code: string) {
  return code.length > 0 && !RESERVED.has(code);
}
