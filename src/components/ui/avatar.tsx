import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { bottts } from "@dicebear/collection";

export function UserAvatar({ seed, className }: { seed: string; className?: string }) {
  const dataUri = useMemo(
    () =>
      createAvatar(bottts, {
        seed,
        backgroundColor: ["1f2937", "111827", "312e81"]
      }).toDataUri(),
    [seed]
  );

  return <img src={dataUri} alt="avatar" className={className ?? "h-10 w-10 rounded-full border border-border"} />;
}
