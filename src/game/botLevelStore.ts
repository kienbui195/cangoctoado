// Remembers the practice-bot level between visits. It only pre-selects the level in the popup, it never starts a match by itself.
import { BotLevel, isBotLevel } from './royaleEngine';

const KEY = 'gunny.botLevel';

export function loadBotLevel(): BotLevel | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return isBotLevel(v) ? v : null;
  } catch {
    return null; // private window, blocked or cleared storage
  }
}

export function saveBotLevel(level: BotLevel) {
  try {
    window.localStorage.setItem(KEY, level);
  } catch {
    /* storage unavailable: the popup simply opens without a pre-selected level next time */
  }
}
