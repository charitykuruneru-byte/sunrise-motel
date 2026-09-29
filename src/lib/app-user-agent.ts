/**
 * The Android wrappers stamp their own name onto the WebView user agent, and the
 * site reads that marker to know it is already inside one of our apps — so no
 * "install the app" prompt is ever shown from inside an app.
 *
 * Guest app:  SunriseMotelApp/1.3   (com.sunrisemotel.app)
 * Manager app: SunriseManagerApp/1.0 (com.sunrisemotel.admin)
 */
export const GUEST_APP_MARKER = "SunriseMotelApp";
export const MANAGER_APP_MARKER = "SunriseManagerApp";

/** True when the request comes from either Sunrise Android app. */
export function inSunriseApp(userAgent: string | undefined | null) {
  const ua = userAgent ?? "";
  return ua.includes(GUEST_APP_MARKER) || ua.includes(MANAGER_APP_MARKER);
}