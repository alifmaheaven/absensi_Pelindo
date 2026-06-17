---
phase: Mobile Code Review
reviewed: 2026-06-17T12:00:00Z
depth: deep
files_reviewed: 29
files_reviewed_list:
  - Mobile/lib/axios.ts
  - Mobile/lib/storage.ts
  - Mobile/stores/auth.ts
  - Mobile/stores/ticket.ts
  - Mobile/types/auth.ts
  - Mobile/types/ticket.ts
  - Mobile/types/attendance.ts
  - Mobile/types/version.ts
  - Mobile/types/theme.ts
  - Mobile/types/index.ts
  - Mobile/utils/handle-request.ts
  - Mobile/utils/utils.ts
  - Mobile/hooks/use-request.ts
  - Mobile/hooks/use-auth-guard.ts
  - Mobile/hooks/useLocationCheck.ts
  - Mobile/hooks/useImagePicker.ts
  - Mobile/services/auth.ts
  - Mobile/services/attendance.ts
  - Mobile/services/ticket.ts
  - Mobile/services/version.ts
  - Mobile/components/ui/map-embed.tsx
  - Mobile/components/ui/toast.tsx
  - Mobile/components/ui/collapsible.tsx
  - Mobile/components/ui/date-picker.tsx
  - Mobile/components/home/AttendanceCard.tsx
  - Mobile/components/ticketing/ticket-skeleton.tsx
  - Mobile/constants/index.ts
  - Mobile/app/_layout.tsx
  - Mobile/app/(tabs)/_layout.tsx
  - Mobile/app/(tabs)/index.tsx
  - Mobile/app/(tabs)/izin.tsx
  - Mobile/app/(tabs)/jadwal.tsx
  - Mobile/app/(tabs)/profile.tsx
  - Mobile/app/auth.tsx
  - Mobile/app/(no-tabs)/_layout.tsx
  - Mobile/app/(no-tabs)/checkin.tsx
  - Mobile/app/(no-tabs)/checkout.tsx
  - Mobile/app/(no-tabs)/leave/create.tsx
  - Mobile/app/(no-tabs)/ticketing/index.tsx
  - Mobile/app/(no-tabs)/ticketing/create.tsx
  - Mobile/app/(no-tabs)/ticketing/[id].tsx
findings:
  critical: 5
  warning: 12
  info: 10
  total: 27
status: issues_found
---

# Mobile (Expo/React Native) Code Review Report

**Reviewed:** 2026-06-17T12:00:00Z
**Depth:** deep (cross-file analysis)
**Files Reviewed:** 29
**Status:** issues_found

## Summary

The mobile codebase is a functional Expo Router application with React Native, Zustand, and Axios. The overall architecture follows reasonable patterns, but there are several critical security issues (hardcoded secrets, insecure WebView configurations), logic bugs (broken file upload in checkout, stale closures in hooks, invalid StyleSheet value), and quality concerns (massive code duplication, unused variables, debug logging in production).

---

## Critical Issues

### CR-01: Hardcoded mCaptcha Site Key and URL in Source Code

**File:** `Mobile/app/auth.tsx:201,222`
**Issue:** The mCaptcha site key (`xDpgSpCZJQVamuVnJDfmn1mi6rG2BQeR`) and server URL (`https://captcha.vps.prakhya.id`) are hardcoded as fallback values directly in the source code. If `EXPO_PUBLIC_MCAPTCHA_SITE_KEY` or `EXPO_PUBLIC_MCAPTCHA_URL` environment variables are not set, the fallback credentials are exposed to anyone who can read the JavaScript bundle (which is trivially inspectable in a mobile app or web build).

**Fix:** Remove the hardcoded fallback values. Require the environment variables to be set and fail at build time if they are missing. Use `expo-constants` to validate during app startup instead of embedding secrets in source.

```typescript
// auth.tsx
const MCAPTCHA_URL = process.env.EXPO_PUBLIC_MCAPTCHA_URL;
const MCAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_MCAPTCHA_SITE_KEY;

// Guard at startup — crash early rather than expose default secrets
if (!MCAPTCHA_URL || !MCAPTCHA_SITE_KEY) {
  throw new Error('EXPO_PUBLIC_MCAPTCHA_URL and EXPO_PUBLIC_MCAPTCHA_SITE_KEY must be set');
}
```

---

### CR-02: Insecure WebView Configuration in Map Component

**File:** `Mobile/components/ui/map-embed.tsx:54-64`
**Issue:** The WebView used for the Leaflet map has `originWhitelist={["*"]}` (line 58), `javaScriptEnabled={true}` (line 59), and `mixedContentMode="always"` (line 63). The `originWhitelist={["*"]}` combined with `source={{ html: ... }}` means the WebView allows navigation to arbitrary external URLs via user interaction. Since the map HTML template injects user location coordinates directly via string interpolation (`${lat}, ${lon}`), there is a potential DOM-based vector if these values are compromised, though the current interpolation is numeric-only.

**Fix:** Tighten the `originWhitelist` to only the map tile server domains actually needed, or set it to an empty array `{[]}` when loading inline HTML (which disallows navigation entirely).

```typescript
<WebView
  ref={webViewRef}
  source={{ html: createMapHTML() }}
  style={{ width: "100%", height: 200 }}
  originWhitelist={[]}
  javaScriptEnabled={true}
  domStorageEnabled={false}
  startInLoadingState={false}
  mixedContentMode="never"
  allowsInlineMediaPlayback={true}
/>
```

---

### CR-03: File Upload Broken in Checkout Screen (Type Mismatch)

**File:** `Mobile/app/(no-tabs)/checkout.tsx:139`
**Issue:** The `uploadTemp` service adapter passes a plain JavaScript object `{ uri, name, type }` directly to `uploadEvid`, but `uploadEvid` (in `services/attendance.ts:26`) expects a `File` object and wraps it in a `FormData` with `formData.append("files", file)`. In React Native, the native `File` constructor does not exist; Axios expects a special object structure `{ uri, name, type }` for multipart uploads. Passing the raw object causes the upload to silently fail or send an empty/invalid payload.

**Fix:** The upload service must construct the proper React Native-compatible multipart structure:

```typescript
// In checkout.tsx
import { uploadEvid as uploadEvidOriginal } from "@/services/attendance";

const uploadService = {
  uploadTemp: async (file: { uri: string; name: string; type: string }) => {
    const formData = new FormData();
    formData.append("files", {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);
    const response = await axios.post("/attendance/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
  deleteTemp: async (payload: { links: string[] }) => {
    // no-op for temp deletion
  },
};
```

The same bug exists in `leave/create.tsx:217` and `ticketing/[id].tsx:283` which use `uploadEvid` directly with the same pattern.

---

### CR-04: Stale Closure Bug in `useRequest` Hook

**File:** `Mobile/hooks/use-request.ts:3`
**Issue:** The `useRequest` hook accepts a `request` function as a parameter. The `run` function captures `request` from the closure at the time `useRequest` is called. If the `request` function depends on reactive state (e.g., query parameters that change), the hook will always call the original function with stale values. This is a classic React stale closure bug. For example, in `checkin.tsx:74`, `getAttendanceSite` is wrapped in `useRequest` with fixed `{ page: 1, per_page: DEFAULT_PAGE_SIZE }` — but if those params ever changed, the old params would be used.

**Fix:** Either remove `useRequest` entirely (it adds no value over a simple `useState` pair) and let components manage loading state directly, or make it accept a factory/promise-returning function that captures fresh values:

```typescript
export function useRequest<T>(requestFactory: () => Promise<T>) {
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    try {
      setLoading(true);
      return await requestFactory();
    } finally {
      setLoading(false);
    }
  }, [requestFactory]); // This still doesn't work if requestFactory is inline

  return { run, loading };
}
```

Better yet, eliminate the hook and use simple state management instead, since the hook's abstraction leaks and adds no real benefit.

---

### CR-05: Invalid StyleSheet Value - `borderRadius: "100%"` (String Instead of Number)

**File:** `Mobile/app/(tabs)/index.tsx:595`
**Issue:** In the `notificationBtn` style, the value `borderRadius: "100%"` is set. In React Native, `borderRadius` accepts only numbers, not strings or percentages. This will cause a runtime warning and the style will be ignored, resulting in the notification button not being rendered as perfectly round.

**Fix:**

```typescript
notificationBtn: {
    marginRight: 12,
    position: "relative",
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 100,  // Use a large number for a fully round shape
    justifyContent: "center",
    alignItems: "center",
},
```

---

## Warnings

### WR-01: `canAskAgain` Variable Declared But Never Used (Multiple Files)

**File(s):**
- `Mobile/app/auth.tsx:62`
- `Mobile/app/(no-tabs)/checkin.tsx` (pickImage flow)
- `Mobile/app/(no-tabs)/leave/create.tsx` (pickImage flow)
- `Mobile/app/(no-tabs)/ticketing/[id].tsx` (pickImage flow)
- `Mobile/hooks/useImagePicker.ts:62`

**Issue:** The `canAskAgain` variable is destructured from `getPermission()` return values but is never referenced anywhere. This creates dead code and a false sense of permission handling. The permission denial logic does not differentiate between "denied once" (where `canAskAgain = true`, user can be re-prompted) and "denied permanently" (where `canAskAgain = false`, user must go to settings).

**Fix:** Either remove the unused destructuring or use `canAskAgain` to provide a smarter UX path — if `canAskAgain` is `true`, request permission directly. If `false`, skip straight to the settings alert.

---

### WR-02: "Remember Me" Checkbox Does Not Actually Affect Token Persistence

**File:** `Mobile/app/auth.tsx:36,81-88`
**Issue:** The `rememberMe` state is toggled by a checkbox on the login screen, but the `handleLogin` function unconditionally calls `saveToken(res.data.token)` regardless of the `rememberMe` value (line 87). The `saveToken` function always writes to SecureStore (or localStorage on web), which persists the token across app restarts. The `rememberMe` flag has zero functional impact.

**Fix:** Either remove the `rememberMe` UI entirely, or implement the expected behavior:

```typescript
if (res.data?.token) {
  if (rememberMe) {
    await saveToken(res.data.token);  // Persist
  }
  // In-memory session only — store in Zustand
  useAuthStore.getState().setToken(res.data.token);
}
```

This also requires changes to the auth guard and axios interceptor to check the in-memory token as well as SecureStore.

---

### WR-03: Duplicate `SeveritySelector` Component and `parseSeverityColor` Function

**File(s):**
- `Mobile/app/(no-tabs)/ticketing/create.tsx:597-634` (defines and exports SeveritySelector)
- `Mobile/app/(no-tabs)/ticketing/[id].tsx:813-850` (IDENTICAL definition and exports SeveritySelector)

**Issue:** The `SeveritySelector` component and `parseSeverityColor` helper are duplicated across two files with identical implementation (~60 lines each). This violates DRY and leads to maintenance issues if one file is updated but the other is not.

**Fix:** Extract `SeveritySelector` and `parseSeverityColor` into a shared component file:

```typescript
// Mobile/components/ticketing/severity-selector.tsx
export function SeveritySelector({ value, onChange, options }: Props) { ... }
export function parseSeverityColor(hex: string | undefined) { ... }
```

---

### WR-04: Unused `subtitle2` Prop in AttendanceCard Interface

**File:** `Mobile/components/home/AttendanceCard.tsx:82`
**Issue:** The `AttendanceCard` interface defines `subtitle2?: string`, but the component function (line 87) destructures only `{ type, time, subtitle, onPress, badgeText }` — `subtitle2` is never used.

**Fix:** Remove the unused prop from the interface.

---

### WR-05: `getGoogleMapsEmbedUrl` Function Is Defined But Never Used

**File:** `Mobile/utils/utils.ts:45-49`
**Issue:** The function `getGoogleMapsEmbedUrl` is exported but never imported or called anywhere in the codebase. The project migrated to Leaflet/OSM for maps (as noted in team memory), but this dead code remains.

**Fix:** Remove the dead function.

---

### WR-06: `useAuthGuard` Has Redundant Duplicate State Variables

**File:** `Mobile/hooks/use-auth-guard.ts:8-9`
**Issue:** Both `checking` and `isLoading` are initialized to `true` and always set to the same values in the `finally` block (lines 33-34: `setIsLoading(false); setChecking(false)`). They are always identical; one is redundant.

**Fix:** Remove one of the state variables. If both are needed for different purposes, ensure they have distinct semantics.

---

### WR-07: `console.debug` and `console.error` Calls in Production Code

**File(s):** Nearly every file in the codebase (auth.tsx, checkin.tsx, checkout.tsx, attendance.ts, ticket.ts, useImagePicker.ts, _layout.tsx, etc.)

**Issue:** The codebase contains dozens of `console.debug` and `console.error` calls that will execute in production builds. While Expo may strip some of these, `console.error` is typically preserved. This clutters device logs and can expose implementation details.

**Fix:** Either remove these logs entirely, or use a production-safe logging utility:

```typescript
// utils/logger.ts
const isDev = __DEV__;
export const logger = {
  debug: (...args: any[]) => isDev && console.debug(...args),
  error: (...args: any[]) => console.error(...args),  // Keep errors
};
```

---

### WR-08: Notification Badge Hardcoded to "3"

**File:** `Mobile/app/(tabs)/index.tsx:240`
**Issue:** The notification badge text is hardcoded to `"3"` with no connection to actual notification count from any API or store. This will always show "3" regardless of actual notifications.

**Fix:** Connect to an actual notification count from the state/store or remove the badge until notification support is implemented.

---

### WR-09: `DatePicker` Does Not Validate `value` Prop

**File:** `Mobile/components/ui/date-picker.tsx:27-30`
**Issue:** If the `value` prop is an invalid date string (e.g., `""` or malformed input), `new Date(value)` returns `Invalid Date`. Calling `initial.getFullYear()` on an invalid date returns NaN, and `setYear(NaN)` corrupts the calendar display with NaN values.

The code at line 27 does `const initial = value ? new Date(value) : today;` — but `value` could be `"not-a-date"` which is truthy but invalid.

**Fix:** Add validation:

```typescript
const initial = value ? new Date(value) : today;
const isValid = !isNaN(initial.getTime());
const safeInitial = isValid ? initial : today;
const [year, setYear] = useState(safeInitial.getFullYear());
```

---

### WR-10: Pagination Initializes `page: 2` Instead of Using API Response

**File:** `Mobile/app/(no-tabs)/ticketing/index.tsx:309`
**Issue:** After a refresh (pull-to-refresh), the meta state is set to `page: 2` (hardcoded), not `meta.page + 1` or `meta.next_page`. If the API returns `meta.page = 1`, the next fetch uses `page = 2`, which is correct. But if the API pagination is non-standard, this could skip pages or make duplicate requests.

**Fix:** Use the API response to set the next page:

```typescript
setTicketMeta((prev) => ({
  ...prev,
  total: meta?.total || 0,
  page: (meta?.page || 1) + 1,
  total_pages: meta?.total_pages || 0,
}));
```

---

### WR-11: Map Uses Default Coordinates (-2.5, 118) When Location Is Null

**File:** `Mobile/components/ui/map-embed.tsx:14-15`
**Issue:** When `location` is `null`, the map falls back to coordinates `lat: -2.5, lon: 118` (which is central Indonesia). This default is shown briefly while location is being fetched. However, since the parent component (`checkin.tsx`) renders a loading spinner instead of the map when location is null (lines 298-304), this fallback should never be visible in that flow, but other callers might show it unintentionally.

**Fix:** If the component shouldn't render without a real location, remove the default coordinates and return `null` instead at the HTML creation level.

---

### WR-12: Route Path Inconsistency for Ticketing Navigation

**File:** `Mobile/app/(no-tabs)/ticketing/index.tsx:335-338`
**Issue:** The navigation to ticket detail uses `pathname: '/ticketing/[id]'` with `params: { id: item.id }`. However, the route file is at `(no-tabs)/ticketing/[id].tsx`. The Expo Router resolves this correctly because the screen navigates from within the `(no-tabs)` group, but the path looks absolute while the route is nested. If the component were moved or used outside the group, the router would break.

**Fix:** Use the relative route format: `router.push({ pathname: '/ticketing/[id]', params: { id: item.id } })` — this is fine as-is for Expo Router nested groups, but should be documented.

---

## Info

### IN-01: Magic Strings for Colors Repeated Across Files

**Files:** Nearly every screen file

**Issue:** Colors like `"#1e90ff"`, `"#3B82F6"`, `"#333"`, `"#666"`, `"#999"` appear dozens of times across all screen files. These should be defined as constants in the theme file (`constants/theme.ts`) and imported where needed.

---

### IN-02: Massive StyleSheet Duplication Between `checkin.tsx` and `checkout.tsx`

**Files:**
- `Mobile/app/(no-tabs)/checkin.tsx` (420+ lines of styles)
- `Mobile/app/(no-tabs)/checkout.tsx` (60+ lines of styles)

**Issue:** The checkin.tsx and checkout.tsx screens share nearly identical header gradients, layouts, form inputs, image grids, modals, and buttons. Approximately 300+ lines of StyleSheet definitions are duplicated. The same applies to `leave/create.tsx`.

**Fix:** Extract shared styles into a constants or shared stylesheet file, e.g., `constants/screens-styles.ts`.

---

### IN-03: `notificationButtonPlaceholder` Pattern Repeated

**Files:** `checkin.tsx`, `checkout.tsx`, `ticketing/create.tsx`, `ticketing/[id].tsx`, `leave/create.tsx`

**Issue:** The pattern of using a spacer `View` with `{ width: 40 }` to center the header title is repeated across all form screens. This is a fragile centering technique.

**Fix:** Use a proper flexbox centering approach: set `flex: 1` and `textAlign: center` on the title, or use `position: 'absolute'` with `left: 0, right: 0` for the title.

---

### IN-04: Version Check Alert Fires on Every App Restart

**File:** `Mobile/app/_layout.tsx:37-52`
**Issue:** The version mismatch check runs on every app launch and shows an `Alert.alert` if the version differs. This means users who have already been notified will see the alert repeatedly. The version code should be cached using `saveVersionCode`/`getVersionCode` to only alert on new versions.

**Fix:**

```typescript
const lastVersion = await getVersionCode();
if (latest.name !== currentNativeVersion && latest.name !== lastVersion) {
  // Show alert
  await saveVersionCode(latest.name);
}
```

---

### IN-05: Commented-Out Gallery Picker Code Left in Production

**Files:**
- `Mobile/app/auth.tsx` (mCaptcha WebView comments)
- `Mobile/app/(no-tabs)/checkin.tsx:498-509`
- `Mobile/app/(no-tabs)/ticketing/create.tsx:558-569`
- `Mobile/app/(no-tabs)/ticketing/[id].tsx:774-785`
- `Mobile/app/(no-tabs)/leave/create.tsx:573-584`
- `Mobile/hooks/useImagePicker.ts` (commented gallery reference)

**Issue:** Gallery picker buttons are commented out in all screens. This indicates an unfinished camera-only restriction.

**Fix:** Either remove the commented code entirely (version control history preserves it) or implement gallery support if needed.

---

### IN-06: Password Field Exposed in TypeScript Interfaces

**File:** `Mobile/types/auth.ts:13` and `Mobile/types/ticket.ts:91`

**Issue:** The `IUser` and `ITicketUser` interfaces include the field `password: string`. If the API response for `/auth/profile` includes the password hash or plaintext password, the mobile client will store it in the Zustand store (which is in-memory) and potentially expose it via React DevTools or serialization.

**Fix:** Either mark it as optional (`password?: string`) or create a separate `IUserPublic` interface without the password field for profile responses.

---

### IN-07: Type Assertions `as any` for File Uploads

**Files:** `Mobile/hooks/useImagePicker.ts:116`, `Mobile/app/auth.tsx`, `Mobile/app/(no-tabs)/leave/create.tsx:221`, `Mobile/app/(no-tabs)/ticketing/[id].tsx:287`

**Issue:** Multiple places use `as any` when passing image objects to upload functions. The root cause is that React Native does not have a native `File` constructor, making the typed `File` parameter incorrect for React Native.

**Fix:** Define a proper React Native file type:

```typescript
// types/index.ts
export interface RNFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}
```

Then update upload functions to accept `RNFile | File`.

---

### IN-08: `ThemedText` and `ThemedView` Components Have Minimal Usage

**Files:** `Mobile/components/themed-text.tsx`, `Mobile/components/themed-view.tsx`

**Issue:** `ThemedText` and `ThemedView` are imported only in `collapsible.tsx` and `modal.tsx`. The rest of the app uses `Text` and `View` directly from React Native, ignoring the theme-aware wrappers. This suggests the app started from a template (e.g., Expo Router template) and never migrated fully to the themed variants.

**Fix:** Either remove the unused themed components or use them consistently across the app.

---

### IN-09: `formatter` Variable Defined in `jadwal.tsx` But Only Used Once

**File:** `Mobile/app/(tabs)/jadwal.tsx:35`
**Issue:** `const formatter = new Intl.DateTimeFormat("id-ID", { day: "numeric" })` is created at module level but only used once in the `.map()` callback (line 62). This is minor but unnecessary.

**Fix:** Inline the formatter call or remove the variable.

---

### IN-10: `unstable_settings` Export May Cause Confusion

**File:** `Mobile/app/_layout.tsx:11-13`
**Issue:** The `export const unstable_settings = { anchor: "(tabs)" }` is present but has no visible effect on routing behavior. This is an Expo Router template holdover.

**Fix:** Either document its purpose or remove it.

---

_Reviewed: 2026-06-17T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
