# Budget Tracker — UI/UX & "AI Slop" Design Audit (`apps/mobile`)

Audited: `apps/mobile/src/app/`, `apps/mobile/src/common/`, `apps/mobile/src/features/` against Expo SDK 58 standards, `.gemini/rules/ui-ux-guardrails.md`, and `.agents/skills/ui-ux-checker/SKILL.md`.

---

## 1. Visual & Structural AI Slop Findings

### A. SaaS Card-Soup & Forced Dark Cards in Light Mode
- **Single-Column Pancake Stacking**: `apps/mobile/src/features/dashboard/screens/dashboard-screen.tsx:69-431` stacks 9 heavy `rounded-3xl p-5 bg-white dark:bg-slate-900 border border-slate-200/80` cards vertically with no editorial asymmetry or visual hierarchy (`SafeToSpendCard`, `NetWorthCard`, `BudgetProgressCard`, `Accounts`, `EnvelopeBudgetsCard`, `SinkingFundsCard`, `CategoryBreakdownCard`, `TagInsightsCard`, `Recent Activity`, plus a full-width `Clear All Entries` card at `L424`).
- **Hardcoded Dark Cards in Light Mode**:
  - `apps/mobile/src/features/dashboard/components/net-worth-card.tsx:34` forces `bg-slate-900 dark:bg-slate-900 border-slate-800` and `bg-slate-800/70` (`L84,98,112`) even in light mode.
  - `apps/mobile/src/features/accounts/screens/accounts-screen.tsx:440` forces `bg-slate-900` on the Total Balance KPI card.
  - `apps/mobile/src/features/expenses/screens/expenses-screen.tsx:795` forces `bg-slate-900` on the Combined Monthly Outflow banner.

### B. Buzzword Copy & Expo Starter Boilerplate Leftovers
- **Generic Buzzwords**:
  - `"FINTECH WORKSPACE"` pill/subtitle in `apps/mobile/src/common/components/app-tabs.web.tsx:288` and `apps/mobile/src/features/auth/screens/login-screen.tsx:68`.
  - `"GET STARTED"` pill badge in `apps/mobile/src/features/auth/screens/register-screen.tsx:58`.
  - `"Financial command center"` subtitle in `apps/mobile/src/features/dashboard/screens/dashboard-screen.tsx:93`.
  - `"Export for peace of mind..."` (`L302`) and `"RFC 4180 Compliant"` pill (`L568`) in `apps/mobile/src/features/portability/screens/portability-screen.tsx`.
- **Expo Template Leftovers**:
  - `apps/mobile/src/app/_layout.tsx:9,38` mounts `<AnimatedSplashOverlay />` (`animated-icon.tsx`, `animated-icon.web.tsx`, `animated-icon.module.css`) displaying the Expo logo glow splash.
  - `apps/mobile/src/common/components/app-tabs.web.tsx:360-375` renders an external `"Docs"` link to `https://docs.expo.dev` inside the signed-in sidebar footer.
  - `apps/mobile/src/common/components/app-tabs.tsx:19-70` reuses only 2 starter PNGs (`home.png`, `explore.png`) across all 7 native tabs.
  - Unused starter files: `apps/mobile/src/common/components/hint-row.tsx` and `apps/mobile/src/common/components/web-badge.tsx`.

### C. Emoji Clutter as Primary UI Icons
Raw Unicode emojis are used as buttons, headers, status indicators, and empty states across every screen instead of vector/SF Symbols (`SymbolView`):
- `dashboard-screen.tsx:105,143,198,301,322,330,427` (`Export 💾`, `👤`, `Reconcile ⚖️`, `📝`, `🏷️`, `🔀`, `🗑️ Clear All Entries`)
- `safe-to-spend-card.tsx:103,105,112,114,122,498,578,635` (`⚠️`, `🚨`, `⚡`, `🛡️`, `📅`, `✏️`)
- `budget-progress-card.tsx:120,161` (`✏️ Edit Target`, `⚠️`)
- `category-breakdown-card.tsx:39` (`📊`), `tag-insights-card.tsx:22,32` (`🏷️`), `envelope-budgets-card.tsx:303,324,500` (`✉️`, `🏷️`), `sinking-funds-card.tsx:426,475,482,770,885` (`🎯`, `🏦`, `🎉`, `📊`)
- `capture-screen.tsx:369,454,477,489,647` (`⚡`, `History 📜`, `🔀`, `⚠️`), `amount-display.tsx:133` (`⌨️ Keyboard active`)
- `transactions-screen.tsx:116,216,299,308,352,367,381,389` (`Export 📥`, `🧾`, `🏪`, `📝`, `📷`)
- `expenses-screen.tsx:652,691,714,745,948,1164,1217,1295` (`⚡`, `🧾`, `🔄`, `⚠️`, `🔍`, `📝`)
- `expense-card.tsx:64,131,160,168` (`🔀`, `🏷️`, `📝`, `📷`), `scheduled-expense-card.tsx:129,174,182,190,252` (`📅`, `🏦`, `⚡`, `📝`)
- `accounts-screen.tsx:58-133,542` (`🏦`, `📱`, `💵`, `💳`), `reconciliation-screen.tsx:469,593` (`🎉`, `⚖️`)
- `portability-screen.tsx:449,469,483,537,547,589,670,773,836,877,928,940,974` (`📤`, `📥`, `💾`, `📋`, `📊`, `📂`, `🔍`, `⚠️`, `✨`, `🚀`)

### D. Color Drift, Glowing Shadows & Pill Badge Overload
- **Palette Drift & Hardcoded Hexes**: `tailwind.config.js:13-25` defines `#208AEF`, `theme.ts:9-24` defines pure monochrome `#000`/`#fff`, yet feature code introduces `indigo-*`, `purple-*`, `violet-*`, `sky-*`, `blue-*` and raw hex literals (`#3b82f6` in `safe-to-spend-card.tsx:883`, `reconciliation-screen.tsx:516`, `sinking-funds-card.tsx:49`; `#0ea5e9` in `envelope-budgets-card.tsx:298,601`; `#208AEF` in `transactions-screen.tsx:209`).
- **Colored Drop Shadows**: Heavy `shadow-md shadow-brand-500/25`, `shadow-lg shadow-brand-500/30`, `shadow-sm shadow-rose-500/25` across buttons and cards.
- **Pill Badge Overload**: `scheduled-expense-card.tsx:141-194` and `expense-card.tsx:91-107,142-173` stack 5–7 rounded pills per card; `portability-screen.tsx:383-399,498-512,561-570,789-818` clusters redundant rounded-full count pills; `sync-status-badge.tsx:70` uses a decorative dot.

### E. Typography & Numeric Alignment
- **Zero `tabular-nums`**: Nowhere in `apps/mobile/src/` is `fontVariant: ['tabular-nums']` applied to currency totals, KPI numbers, or ledger rows.
- **Micro-Label Spam**: 15+ files repeat `text-[10px] font-bold uppercase tracking-widest` / `tracking-wider` on nearly every label and header.

---

## 2. UX, Platform & Guardrail Bugs
1. **Unconfirmed Destructive Reset**: `dashboard-screen.tsx:420` fires `clearAllMutation.mutate()` immediately on tap without confirmation.
2. **Web `Alert.alert` No-Op**: `safe-to-spend-card.tsx:220,233,250` calls `Alert.alert`, which is a silent no-op on React Native Web; `envelope-budgets-card.tsx:197-200` falls back to `window.confirm`.
3. **Ordinal Bug**: `safe-to-spend-card.tsx:768` renders `{day}th` (producing `"1th"`).
4. **Hardcoded Currency Words**: `reconciliation-screen.tsx:419-452` uses `"pesos"` in accessibility labels and `"to the penny"` at `L474`.
5. **Touch Targets < 44x44**: Multiple `h-7`/`h-8`/`h-9` pressables without sufficient padding (`expenses-screen.tsx`, `expense-card.tsx`, `scheduled-expense-card.tsx`, `budget-progress-card.tsx`, `envelope-budgets-card.tsx`, `sinking-funds-card.tsx`, `transactions-screen.tsx`, `portability-screen.tsx`).
6. **Inconsistent `SafeAreaView` Bottom Edges**: Standalone routes (`reconciliation-screen.tsx:150`, `portability-screen.tsx:259`) omit `'bottom'` edge despite having no native bottom tab bar.
7. **Redundant Back Header on Desktop Web**: `reconciliation-screen.tsx:157-200` and `portability-screen.tsx:265-308` render a mobile `← Back` bar even when the persistent desktop sidebar is active.
8. **Mixed Styling & Text Primitives**: Auth screens and `transactions-screen.tsx` use raw `<Text>` instead of `<ThemedText>`.
