---
name: ui-ux-checker
description: >-
  Validates and audits UI/UX changes across iOS, Android, and Web in apps/mobile.
  Use this skill whenever components, screens, styles, navigation, or assets in apps/mobile
  are added, modified, or refactored to prevent layout breakages, missing safe areas,
  broken theme support, inaccessible touch targets, or cross-platform regressions.
---

# UI/UX Checker Skill

This skill provides an actionable verification checklist and audit procedure for all UI/UX modifications within `apps/mobile` (`@repo/mobile`). It ensures strict adherence to cross-platform compatibility (iOS, Android, Web), accessibility standards, theme and design consistency, and clean Expo Router architectural conventions.

---

## 1. When to Use This Skill

Execute this audit whenever:
- Adding or modifying screens in `apps/mobile/src/features/*/screens/` or routes in `apps/mobile/src/app/`.
- Creating or editing reusable UI components in `apps/mobile/src/common/components/` or feature components in `apps/mobile/src/features/*/components/`.
- Adjusting styling tokens, themes, global CSS (`apps/mobile/src/global.css`), or NativeWind configuration (`apps/mobile/tailwind.config.js`).
- Adding forms, modals, keypad overlays, or interactive elements.
- Refactoring navigation, layouts, or platform overrides (`*.web.tsx`).

---

## 2. Comprehensive Audit Checklist

### A. Cross-Platform Parity (iOS, Android, Web)
- [ ] **Safe Area Insets**:
  - Use `SafeAreaView` from `react-native-safe-area-context` or `useSafeAreaInsets()`.
  - Account for top insets (notches, Dynamic Island, status bars) and bottom insets (home indicator, Android navigation bar, bottom tab bar offset).
  - Verify `BottomTabInset` from `@/constants/theme` when positioning floating actions or fixed bottom bars.
- [ ] **No Accidental Web/DOM Globals on Native**:
  - Never reference `window`, `document`, `navigator`, or `localStorage` directly in cross-platform code.
  - For sensitive storage, use `expo-secure-store` wrappers via `@/common/lib/`.
  - If Web-specific APIs or CSS are required, isolate them in `.web.tsx` files and provide a matching native base file (`.tsx`).
- [ ] **Keyboard Handling & Input Visibility**:
  - Enclose form inputs within `KeyboardAvoidingView` configured with platform-specific behavior:
    ```tsx
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    ```
  - Ensure parent scroll containers set `keyboardShouldPersistTaps="handled"` so taps outside dismiss keyboards smoothly and buttons respond on first press.
- [ ] **Platform Extensions & Overrides**:
  - Divergent layouts must have both a base file and a platform variant (e.g. `_layout.tsx` and `_layout.web.tsx`, or `app-tabs.tsx` and `app-tabs.web.tsx`).
  - Small conditional styles should use `Platform.select({ ios: ..., android: ..., web: ..., default: ... })`.
- [ ] **Static HTML Root (`+html.tsx`) Document Context**:
  - If `apps/mobile/src/app/+html.tsx` exists, verify it calls `useServerDocumentContext()` from `expo-router/html` and renders `{...htmlAttributes}`, `{headNodes}`, `{...bodyAttributes}`, and `{bodyNodes}` so exported static HTML includes styles and hydration scripts.

### B. Design & Theme Consistency
- [ ] **Design Tokens from `@/constants/theme`**:
  - Colors, typography, and spacing must adhere to `@/constants/theme` (`Colors`, `Fonts`, `Spacing`, `MaxContentWidth`).
  - Access colors dynamically via `useTheme()` hook from `@/common/hooks/use-theme`.
- [ ] **Dark & Light Mode Support**:
  - Never hardcode raw hex values (e.g. `#ffffff`, `#000000`, `#111827`) directly in style objects or Tailwind classes without theme awareness.
  - Test that every UI element has sufficient contrast in both light mode and dark mode.
  - Dynamic backgrounds must use `background`, `backgroundElement`, or `backgroundSelected`; dynamic text must use `text` or `textSecondary`.
- [ ] **NativeWind / Tailwind Styling Compliance**:
  - Keep class names consistent with project Tailwind presets.
  - Verify that utility classes compile cleanly without breaking on native runtimes.
  - Avoid arbitrary unverified CSS values that only work on the Web browser.

### C. UX & Accessibility Standards
- [ ] **Touch Target Sizing (Minimum 44x44 pt/px)**:
  - All interactive controls (buttons, icon buttons, list row items, chip filters, toggles) must meet the minimum 44x44 point touch target standard.
  - When visual dimensions are smaller than 44x44 (e.g., small 24x24 icons), apply `hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}`.
- [ ] **Complete State Coverage (Async & Data UI)**:
  - **Loading State**: Provide skeleton placeholders or an `ActivityIndicator` styled with theme colors during data fetching.
  - **Empty State**: When lists or queries return no data, render an informative empty state with a descriptive message and an optional action/call-to-action button.
  - **Error State**: Handle query/mutation failures gracefully with human-readable error messages and retry mechanisms.
  - **Success / Content State**: Smooth transitions without layout jumping, clipping, or text truncation.
- [ ] **Accessibility Semantics**:
  - Provide `accessibilityRole` (e.g., `"button"`, `"header"`, `"link"`, `"alert"`) and `accessibilityLabel` for icon-only buttons or custom interactive components.
  - Ensure labels describe the intent clearly (e.g., "Close dialog", "Add transaction").

### D. Navigation & Route Architecture
- [ ] **Thin Route Files**:
  - Files under `apps/mobile/src/app/**` must remain thin route definitions.
  - Routes only extract route parameters via `useLocalSearchParams` and mount the corresponding screen component from `apps/mobile/src/features/<feature>/screens/<screen>.tsx`.
  - Do NOT embed business logic, direct API queries, complex state machines, or extensive UI in `src/app/`.
- [ ] **Typed & Safe Navigation**:
  - Navigation actions must use `router.push()`, `router.replace()`, or `<Link href="..." />` from `expo-router`.
  - Query parameters must be validated and sanitized.

---

## 3. Verification Protocol & Commands

Before completing any task involving UI/UX changes, execute the following audit steps:

1. **Static Analysis & Typecheck**:
   ```bash
   pnpm --filter @repo/mobile typecheck
   ```
   Ensure zero TypeScript diagnostic errors across all platform types.

2. **Mobile Linter**:
   ```bash
   pnpm --filter @repo/mobile lint
   ```
   Fix any unused imports, accessibility warnings, or styling rule violations.

3. **Full Monorepo Verification**:
   ```bash
   pnpm turbo run typecheck lint
   ```
   Ensure shared contract imports and API alignment remain unbroken.

4. **Code Review Diff Inspection**:
   - Inspect `git diff` for hardcoded color hexes, unhandled safe areas, or missing error/loading states.
   - Confirm proper platform file separation (`.web.tsx` vs `.tsx`) if platform-specific APIs were introduced.

5. **Static Web Export & HTML Integrity (when touching web shell, layouts, global CSS, or PWA assets)**:
   - Run `pnpm run build:vercel` and confirm the exported HTML verification passes (React Native Web `<style id="react-native-stylesheet">`, `/_expo/static/css/` links, `/_expo/static/js/web/` bundle scripts, and PWA manifest linkage).
