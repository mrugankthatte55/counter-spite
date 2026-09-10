export { COLORWAYS, applyColorway, currentColorway, saveSettings } from "./theme";
export type { Career, Settings } from "./theme";
import { WEAPON_ICON, iconSvg } from "./hud";
export function iconFor(name: string) { return iconSvg(WEAPON_ICON[name] ?? "ic-rifle"); }
