/**
 * Shared frontend constants. Mirrors the agent's `translator/src/config.py`
 * where relevant; keep them in sync if you change either.
 */

// Hard cap on participants per room. The token route also embeds this into
// RoomConfiguration.maxParticipants so the server enforces it.
export const MAX_PARTICIPANTS = 8;

// Sentinel meaning "no translation, native passthrough."
export const NATIVE_LANG = "none";

// Participant attribute carrying each participant's chosen language.
export const PARTICIPANT_LANG_ATTR = "lang";
