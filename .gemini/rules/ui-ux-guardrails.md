# UI/UX Guardrails & Quality Verification

This rule enforces strict UI/UX validation, accessibility compliance, and cross-platform integrity whenever modifying any mobile user interface code in `@repo/mobile` (`apps/mobile`).

---

## 1. Scope & Trigger Conditions

This rule applies **mandatorily** whenever an agent or developer adds, modifies, or refactors any files within:
- Route declarations: `apps/mobile/src/app/**`
- Feature screens: `apps/mobile/src/features/**/screens/**`
- Feature components: `apps/mobile/src/features/**/components/**`
- Shared mobile components & hooks: `apps/mobile/src/common/components/**`, `apps/mobile/src/common/hooks/**`
- Theming & styling definitions: `apps/mobile/src/common/constants/theme.ts`, `apps/mobile/src/global.css`, `apps/mobile/tailwind.config.js`
- Mobile assets & web shell/PWA artifacts: `apps/mobile/assets/**`, `apps/mobile/public/**`, `scripts/build-vercel.mjs`

---

## 2. Mandatory Verification Protocol

Before declaring any UI/UX task complete, the agent **MUST** audit changes against the `ui-ux-checker` skill (`.gemini/skills/ui-ux-checker/SKILL.md`) and verify all six mandatory criteria below:

### 1. Cross-Platform Parity & Platform Safety
- **Safe Area Insets**: All views must use `react-native-safe-area-context` (`SafeAreaView` or `useSafeAreaInsets()`) and account for notches, status bars, and bottom navigation/tab bars (`BottomTabInset`).
- **No Direct DOM Globals in Native**: Browser globals (`window`, `document`, `localStorage`, `navigator`) must never be accessed in code executed by native runtimes (iOS/Android). Any Web-specific logic must be isolated in `.web.tsx` files with an accompanying native `.tsx` file.
- **Expo SDK 58 `+html.tsx` Document Context**: Any custom `apps/mobile/src/app/+html.tsx` MUST call `useServerDocumentContext()` from `expo-router/html` and spread/render `{...htmlAttributes}`, `{headNodes}`, `{...bodyAttributes}`, and `{bodyNodes}` so Expo Router injects CSS stylesheets, React Native Web styles, and JS hydration scripts.
- **Keyboard Handling**: All input screens must use `KeyboardAvoidingView` (with OS-appropriate behavior) and `ScrollView` with `keyboardShouldPersistTaps="handled"`.

### 2. Design & Theme Consistency
- **Token Compliance**: All colors, fonts, and spacing must be consumed from `@/constants/theme` (`Colors`, `Fonts`, `Spacing`) or via `useTheme()`.
- **Dark/Light Mode Support**: No hardcoded hex color literals (`#fff`, `#000000`, etc.) in style objects or class names. All components must render with readable contrast in both light and dark themes.

### 3. UX & Accessibility Standards
- **Touch Targets**: All interactive elements (buttons, pressable rows, icon triggers) must provide at least a 44x44 pt/px hit area (using `hitSlop` where visual assets are smaller).
- **Accessibility Attributes**: Provide `accessibilityRole` and `accessibilityLabel` for all custom and icon-only interactive controls.

### 4. Complete UI State Coverage
Every screen and data-dependent component must gracefully handle all four asynchronous states:
1. **Loading**: Theme-aligned activity indicators or skeleton loaders.
2. **Empty**: Informative messages with an actionable call-to-action when lists or records are empty.
3. **Error**: Clear error explanations with retry mechanisms.
4. **Success**: Stable rendering without layout shift or text clipping.

### 5. Architectural Route Integrity
- Route files in `apps/mobile/src/app/**` must remain **thin**: they only extract parameters and mount feature screens from `src/features/<feature>/screens/`.
- No state machines, direct API calls, or complex layout structures in route files.

### 6. Automated Monorepo Checks
The agent must execute and confirm clean passes (0 errors, 0 warnings) for:
```bash
pnpm --filter @repo/mobile typecheck
pnpm --filter @repo/mobile lint
pnpm turbo run typecheck lint
```
Any change touching `apps/mobile/src/app/+html.tsx`, `_layout.web.tsx`, `apps/mobile/src/global.css`, `apps/mobile/public/**`, or `scripts/build-vercel.mjs` **MUST** also run:
```bash
pnpm run build:vercel
```
which automatically validates exported HTML CSS, JS bundle, and PWA manifest integrity.
