"use client";

import { useSyncExternalStore } from "react";

// A timestamp in the READER's timezone.
//
// These were formatted on the server with toLocaleTimeString, which on Vercel
// means UTC — so a photo taken at 2pm in New Jersey was captioned 6pm. The
// server has no idea what time it is where the family lives; only the browser
// does.
//
// useSyncExternalStore is how you ask "am I on the server?" without an effect:
// it returns the server snapshot during SSR and the client one after, so the
// markup React expects and the markup it sent always agree.
const subscribe = () => () => {};
const onClient = () => false;
const onServer = () => true;

export default function LocalTime({
  at,
  withDate = false,
}: {
  /** Epoch milliseconds. */
  at: number;
  withDate?: boolean;
}) {
  const isServer = useSyncExternalStore(subscribe, onClient, onServer);
  if (isServer) return <span />;
  const d = new Date(at);
  return (
    <span>
      {withDate
        ? d.toLocaleString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })
        : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </span>
  );
}
