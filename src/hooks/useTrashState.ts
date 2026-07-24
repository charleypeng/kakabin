import { useEffect, useState } from "react";
import { getTrashCount } from "../lib/trashApi";

export function useTrashState(pollMs = 2000) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      getTrashCount()
        .then((c) => alive && setCount(c))
        .catch(() => {});
    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);
  return count;
}
