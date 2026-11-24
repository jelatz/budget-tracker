# Warm Editorial Ledger — Design System (`DESIGN.md`)

**Product:** Budget Tracker (`@repo/mobile` — iOS, Android, Web)  
**Currency:** Philippine Peso (`₱` / PHP) & multi-currency minor units  
**Aesthetic:** **Warm Editorial Ledger** — calm financial clarity inspired by Mercury, Copilot Money, and Braun/Dieter Rams tactile instrumentation. Replaces generic cool-slate SaaS card-soup, emoji clutter, and glowing blue shadows with warm alabaster paper surfaces, deep forest pine accents, hairline structure, and strict tabular numerals.

---

## 1. Color System

### Light Mode (Warm Alabaster Paper)
| Token | Hex | Role |
|---|---|---|
| `background` (Canvas) | `#FAF8F4` | Primary app background — warm alabaster paper |
| `surface` (Card / Sheet) | `#FFFFFF` | Elevated editorial cards & modals |
| `backgroundElement` (Subtle) | `#F3F0EA` | Sidebar rail, segmented controls, calculator housing, inset wells |
| `backgroundSelected` | `#E9E4DA` | Active well / pressed state |
| `border` (Hairline) | `#E5E0D6` | `1px` structural hairline borders & dividers |
| `borderStrong` | `#CFC8BA` | Input borders & focused frames |
| `text` (Primary Ink) | `#1C1B18` | Warm charcoal ink for titles, ledger rows, amounts |
| `textSecondary` | `#5C584F` | Subtitles, metadata, secondary labels |
| `textMuted` | `#8A8478` | Timestamps, placeholders, quiet captions |
| `primary` (Forest Pine) | `#1B4332` | Primary CTAs, active tabs, selected states |
| `onPrimary` | `#FAF8F4` | Text/icons on primary fill |
| `primarySoft` | `#EAF2EE` | Soft pine tint for active nav wash & info pills |
| `positive` (Income / Safe) | `#1E6F4E` | Inflows, positive net cashflow, balanced state |
| `positiveSoft` | `#EBF5F0` | Soft sage wash for positive status badges |
| `negative` (Expense / Deficit) | `#B4432C` | Outflows, over-budget alerts, destructive actions |
| `negativeSoft` | `#FDF1EE` | Soft terracotta wash for warning/error banners |
| `warning` (Ochre) | `#A16207` | Tight liquidity, approaching threshold |
| `warningSoft` | `#FEF8EC` | Soft ochre wash |
| `info` (Deep Teal) | `#2C5F6E` | Transfers, rollover/goal projections |
| `infoSoft` | `#EDF5F7` | Soft teal wash |

### Dark Mode (Warm Obsidian)
| Token | Hex | Role |
|---|---|---|
| `background` (Canvas) | `#131210` | Warm obsidian canvas |
| `surface` (Card / Sheet) | `#1B1A17` | Warm charcoal surface |
| `backgroundElement` (Subtle) | `#24221E` | Sidebar rail, wells, segmented tracks |
| `backgroundSelected` | `#2F2C26` | Pressed / selected well |
| `border` (Hairline) | `#2E2B25` | `1px` warm hairline |
| `borderStrong` | `#454037` | Focused borders |
| `text` (Primary Ink) | `#F4F1EA` | Warm bone ink |
| `textSecondary` | `#ABA599` | Secondary labels |
| `textMuted` | `#787368` | Captions & placeholders |
| `primary` (Sage Pine) | `#52B788` | High-contrast sage pine CTA & active accent |
| `onPrimary` | `#0B1A12` | High-contrast dark ink on sage pine |
| `primarySoft` | `#162B21` | Deep pine tint |
| `positive` | `#52B788` | Inflows / Safe |
| `positiveSoft` | `#152820` | Deep sage wash |
| `negative` | `#E07A5F` | Outflows / Deficit |
| `negativeSoft` | `#2E1B16` | Deep terracotta wash |
| `warning` | `#E0A458` | Tight liquidity / Near limit |
| `warningSoft` | `#2B2214` | Deep ochre wash |
| `info` | `#76B4C4` | Transfers / Projections |
| `infoSoft` | `#16252A` | Deep teal wash |

---

## 2. Typography & Numeric Discipline
- **Display & UI Sans**: `Plus Jakarta Sans`, `DM Sans`, system UI sans. Tight tracking (`-0.02em`) on screen titles (`24px`–`28px` bold) and hero balances (`32px`–`40px` extrabold).
- **Tabular Numerals (Mandatory)**: Every currency figure, percentage, counter, and calculator digit **MUST** use `fontVariant: ['tabular-nums']` (`<ThemedText numeric>`) so columns and figures never jitter.
- **Monospace**: `JetBrains Mono` reserved strictly for the calculator expression/formula line, raw JSON/CSV import editors, and revision/code tags.
- **Sentence-Case Labels**: Avoid `text-[10px] uppercase tracking-widest` everywhere; reserve subtle uppercase only for sparse section eyebrows (`11px`, `tracking-wider`, muted ink).

---

## 3. Elevation, Borders & Spacing
- **Hairline Separation Over Drop Shadows**: Cards use `1px` hairline borders (`border-ledger-border dark:border-ledger-border-dark`) and tonal contrast (`canvas` -> `surface` -> `subtle`) with **zero** colored glow shadows (`shadow-brand-500/25` is banned).
- **Corner Radius**: `16px` (`rounded-2xl`) for cards and modals; `12px` (`rounded-xl`) for buttons, inputs, and keypad keys; `9999px` (`rounded-full`) only for compact status badges and filter pills.
- **Touch Targets**: Minimum `44x44` pt/px on every interactive control (`min-h-[44px]` or explicit `hitSlop`).

---

## 4. Iconography & Anti-Slop Rules
- **Vector Symbols Only for UI Chrome**: Use `AppIcon` (`expo-symbols` `SymbolView` mapping iOS SF Symbols + Android/Web Material Symbols) for all navigation, buttons, empty states, status badges, and metadata indicators. Never use Unicode emojis (`⚡`, `💾`, `📊`, `📝`, `🎉`, `🚀`, `✨`) as UI icons. (User-selected category/account/vault avatars remain customizable data icons.)
- **Consistent Surface Polarity**: Never place hardcoded `bg-slate-900` dark cards inside a Light Mode screen.
- **Max 1–2 Status Badges per Row**: Replace stacked pill clusters with clean inline metadata separated by middots (`Groceries · BPI Savings · Monthly`).
- **Two-Step Destructive Safety**: Every irreversible action (`Clear All Entries`, `Delete Envelope`, `Delete Bill`) requires an explicit cross-platform inline confirmation step (never bare `Alert.alert` or unconfirmed mutation).
