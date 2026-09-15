const activityIds = new Set([
  "lets-agree", "hot-seat", "discussion-questions", "what-would-you-do",
  "never-have-i-ever", "two-truths-lie", "would-you-rather", "5-second-rule",
  "charades", "imposter",
]);

/** Decorative artwork: the adjacent activity title supplies its accessible name. */
export default function ActivityArtwork({ activityId, className = "" }: {
  activityId: string;
  className?: string;
}) {
  if (!activityIds.has(activityId)) return null;

  return (
    <img
      src={`/event3/activities/${activityId}.webp`}
      alt=""
      aria-hidden="true"
      width={512}
      height={512}
      decoding="async"
      draggable={false}
      className={`activity-artwork ${className || "h-full w-full"}`}
    />
  );
}
