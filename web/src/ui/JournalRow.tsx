export function JournalRow({ text, time }: { text: string; time: string }) {
  return (
    <div className="c0-jrow">
      <span>{text}</span>
      <span className="c0-jrow__time">{time}</span>
    </div>
  );
}
