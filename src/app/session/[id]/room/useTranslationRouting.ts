"use client";

import { useEffect } from "react";
import { useRoomContext } from "@livekit/components-react";
import {
  ParticipantKind,
  RoomEvent,
  type RemoteParticipant,
  type RemoteTrackPublication,
  Track,
} from "livekit-client";
import { NATIVE_LANG, PARTICIPANT_LANG_ATTR } from "@/lib/config";

// Translator-track name format set by the Python agent in
// translator/src/session.py: f"tx:{speaker_identity}:{target_lang}"
const TRANSLATION_TRACK_PREFIX = "tx:";

function parseTranslationTrackName(
  name: string,
): { sourceIdentity: string; targetLang: string } | null {
  if (!name.startsWith(TRANSLATION_TRACK_PREFIX)) return null;
  const parts = name.slice(TRANSLATION_TRACK_PREFIX.length).split(":");
  if (parts.length < 2) return null;
  // Identity can theoretically contain ":"; treat the last segment as the
  // target language and join the rest back.
  const targetLang = parts.pop()!;
  const sourceIdentity = parts.join(":");
  if (!sourceIdentity || !targetLang) return null;
  return { sourceIdentity, targetLang };
}

/**
 * Subscribes/unsubscribes to audio tracks based on the listener's chosen
 * language.
 */
export function useTranslationRouting(myLang: string) {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;

    const apply = () => {
      // 1. Grab the local participant's identity to prevent self-echo
      const localIdentity = room.localParticipant.identity;
      
      const remotes = Array.from(room.remoteParticipants.values());
      const peerLangs = new Map<string, string | undefined>();
      
      for (const p of remotes) {
        if (p.kind === ParticipantKind.AGENT) continue;
        peerLangs.set(p.identity, p.attributes?.[PARTICIPANT_LANG_ATTR]);
      }

      for (const p of remotes) {
        if (p.kind === ParticipantKind.AGENT) {
          // Pass localIdentity down into the agent subscription logic
          applyAgentSubscriptions(p, myLang, peerLangs, localIdentity);
        } else {
          applyHumanSubscriptions(p, myLang);
        }
      }
    };

    apply();

    const handlers: Array<[Parameters<typeof room.on>[0], () => void]> = [
      [RoomEvent.ParticipantConnected, apply],
      [RoomEvent.ParticipantDisconnected, apply],
      [RoomEvent.ParticipantAttributesChanged, apply],
      [RoomEvent.TrackPublished, apply],
      [RoomEvent.TrackUnpublished, apply],
      [RoomEvent.LocalTrackPublished, apply],
    ];
    for (const [event, handler] of handlers) {
      room.on(event, handler);
    }
    return () => {
      for (const [event, handler] of handlers) {
        room.off(event, handler);
      }
    };
  }, [room, myLang]);
}

function applyHumanSubscriptions(p: RemoteParticipant, myLang: string) {
  const theirLang = p.attributes?.[PARTICIPANT_LANG_ATTR];
  const hearNative = myLang === NATIVE_LANG || theirLang === myLang;

  for (const pub of p.audioTrackPublications.values()) {
    if (pub.source !== Track.Source.Microphone) continue;
    setSubscribed(pub, hearNative);
  }
}

function applyAgentSubscriptions(
  agent: RemoteParticipant,
  myLang: string,
  peerLangs: Map<string, string | undefined>,
  localIdentity: string // Added to the signature
) {
  for (const pub of agent.audioTrackPublications.values()) {
    const parsed = parseTranslationTrackName(pub.trackName);
    if (!parsed) {
      // Not a translation track (e.g., agent state audio). Don't touch.
      continue;
    }

    // RULE 1: Never subscribe to the translation of your own voice
    if (parsed.sourceIdentity === localIdentity) {
      setSubscribed(pub, false);
      continue;
    }

    // RULE 2: If we want native audio only, reject all agent tracks
    if (myLang === NATIVE_LANG) {
      setSubscribed(pub, false);
      continue;
    }

    // RULE 3: Ensure the translation track is strictly for my selected language
    const matchesMe = parsed.targetLang === myLang;
    
    // RULE 4: Ensure the original speaker doesn't already speak my language natively
    const speakerLang = peerLangs.get(parsed.sourceIdentity);
    const speakerNotMyLang = speakerLang !== myLang;

    // Apply strict filtering
    setSubscribed(pub, matchesMe && speakerNotMyLang);
  }
}

function setSubscribed(pub: RemoteTrackPublication, desired: boolean) {
  if (pub.isSubscribed !== desired) {
    pub.setSubscribed(desired);
  }
}