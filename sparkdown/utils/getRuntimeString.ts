export function getRuntimeString(seconds: number): string {
  const time = new Date();
  time.setHours(0);
  time.setMinutes(0);
  time.setSeconds(seconds);
  if (seconds >= 3600) {
    return (
      time.getHours().toString().padStart(2, "0") +
      ":" +
      time.getMinutes().toString().padStart(2, "0") +
      ":" +
      time.getSeconds().toString().padStart(2, "0")
    );
  } else {
    return (
      (time.getHours() * 60 + time.getMinutes()).toString().padStart(2, "0") +
      ":" +
      time.getSeconds().toString().padStart(2, "0")
    );
  }
}
