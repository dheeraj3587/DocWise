export function getApiBase() {
  const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  return raw.replace(/\/api\/?$/, "").replace(/\/$/, "");
}
