import { useEffect, useRef } from 'react';
import { teacherGetSessions } from '../services/api';

const POLL_INTERVAL_MS = 2500;

/**
 * Poll teacher sessions while any session has status 'processing' or 'pending'.
 * Calls onUpdate(sessions) on each fetch; stops when no processing sessions or on unmount.
 */
export function usePollSessions(hasProcessing, onUpdate) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!hasProcessing) return;

    const poll = () => {
      teacherGetSessions()
        .then((sessions) => {
          onUpdateRef.current(sessions);
        })
        .catch(() => {});
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasProcessing]);
}
