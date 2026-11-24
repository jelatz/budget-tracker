# Google Stitch Redesign Prompts — Warm Editorial Ledger

Use these prompts in Google Stitch (or via the Stitch MCP) to generate the redesigned **Budget Tracker** UI/UX.

---

## Master Design Prompt (System-Wide Direction)

> Redesign a personal & household **Budget Tracker** application (`iOS`, `Android`, and responsive `Desktop Web`) using a **Warm Editorial Ledger** aesthetic inspired by Mercury, Copilot Money, and Braun/Dieter Rams tactile precision.
>
> **Eliminate all "AI slop" UI tropes:**
> - NO cool-gray/slate card-soup stacked endlessly in a single column.
> - NO purple/indigo/bright-SaaS-blue gradients or glowing colored button shadows.
> - NO emojis as UI icons (no `⚡`, `💾`, `📊`, `📝`, `🎉`, `🚀`). Use crisp `1.5px` monochrome vector line icons throughout.
> - NO hardcoded dark `slate-900` cards in light mode — keep light mode cohesively on warm paper surfaces.
> - NO cluttered pill-badge piles on transaction rows (max 1 status badge per row; use clean middot-separated typography for metadata).
> - NO buzzword copy ("FINTECH WORKSPACE", "GET STARTED", "Financial command center", "RFC 4180 Compliant", or framework "Docs" links).
>
> **Visual & Typographic Rules:**
> - **Light Mode Palette:** Warm Alabaster Paper canvas (`#FAF8F4`), Crisp White Elevated Surface (`#FFFFFF`), Warm Stone Rail/Wells (`#F3F0EA`), `1px` Hairline Borders (`#E5E0D6`), Warm Charcoal Ink (`#1C1B18`), Muted Stone Secondary Ink (`#5C584F`), Deep Forest Pine Primary (`#1B4332`), Positive Pine (`#1E6F4E`), Terracotta Outflow (`#B4432C`), Warm Ochre Warning (`#A16207`), Deep Teal Transfer (`#2C5F6E`).
> - **Typography:** `Plus Jakarta Sans` for headings & UI, strict `tabular-nums` alignment on every currency amount (`₱` Philippine Peso, e.g., `₱42,850.00`), `JetBrains Mono` only for calculator expressions.
> - **Structure:** Asymmetric 2-column editorial Bento on Desktop Web, calm single-column rhythm with generous whitespace on Mobile, `16px` card radii, `12px` control radii, `1px` hairlines instead of heavy shadows.

---

## Screen 1 — Overview Dashboard (Desktop Web, 1440×900)

> Design the **Overview Dashboard** for **Budget Tracker** on Desktop Web (`1440×900`) in the **Warm Editorial Ledger** light theme (`#FAF8F4` alabaster canvas, `#FFFFFF` cards, `#F3F0EA` sidebar rail, `#1B4332` deep forest pine primary, `#E5E0D6` 1px hairline borders, zero colored shadows, zero emojis as UI icons).
>
> **Left Navigation Rail (`248px`, `#F3F0EA`):**
> - Clean header: Pine square `₱` monogram + `"Budget Tracker"` (no `"FINTECH WORKSPACE"` tag).
> - Navigation items with crisp monochrome line icons: **Overview** (active, soft pine tint `#EAF2EE` with `#1B4332` bold text), **Accounts**, **Expenses**, **Fast Entry**, **History**, **Reconcile**, **Backup & Export**.
> - Footer: Quiet `"Cloud Synced"` status indicator, signed-in user card (`"J. Dela Cruz"` / email), and quiet `"Sign Out"` button (no framework Docs link).
>
> **Main Content (`max-width: 1152px`, asymmetric 2-column Bento grid):**
> - **Top Header:** `"Overview"` (`28px` bold `#1C1B18`) with subtitle `"November 2026"`, right-aligned hairline `"Export"` button and solid `#1B4332` `"+ Fast Entry"` button.
> - **Top Hero Row (7:5 split):**
>   - **Left (7/12) — Safe to Spend Hero Card (`#FFFFFF`, subtle `#1E6F4E` left accent rule):** Label `"Safe to Spend"`, soft sage status pill `"Safe & On Track"`, hero balance `"₱28,450.00"` (`36px` tabular-nums), subtext `"₱4,064.29 / day for next 7 days"`, and an expanded clean liquidity breakdown table: `(+) Liquid Cash Balance ₱84,200.00`, `(-) Sinking Fund Reserves -₱22,000.00`, `(-) Upcoming Fixed Bills -₱18,250.00`, `(-) Envelope Budgets Left -₱15,500.00`, hairline divider, `(=) Safe to Spend ₱28,450.00`.
>   - **Right (5/12) — Net Worth & Cashflow Card (matching `#FFFFFF` warm paper card — NOT dark black):** Segmented stone period pill (`This Month` | `7 Days` | `All Time`), `"Total Net Worth"` `"₱164,820.00"`, subtle `"42 transactions in period"`, and a 3-column hairline footer (`Income ₱95,000.00` in pine, `Expense ₱48,150.00` in terracotta, `Net Cashflow +₱46,850.00`).
> - **Accounts Strip (full width):** Horizontal row of crisp account cards (`BPI Savings ₱52,400.00`, `GCash ₱18,300.00`, `Maya Wallet ₱13,500.00`, `BPI Credit -₱9,420.00`) with `"Manage"`, `"Reconcile"`, and `"Transfer"` text links.
> - **Lower Bento (2 columns):**
>   - **Left Column:** **Monthly Spending Target** card (thin `6px` pine progress bar, `"Spent ₱48,150.00 of ₱65,000.00"`, `74%`, `"Edit Target"` hairline button) + **Category Envelopes** card (`Groceries`, `Dining Out`, `Transport` with month `‹ Nov 2026 ›` stepper, rollover tags, and thin progress bars) + **Sinking Funds** card (`Emergency Reserve`, `Car Insurance` with `+ Stash` buttons).
>   - **Right Column:** **Spending by Category** card (multi-segment warm categorical bar + hairline category rows) + **Top #Tags** (`#groceries`, `#commute`, `#work`) + **Recent Activity** ledger list with clean rows, middot metadata (`Merchant · Account · Nov 24`), tabular-nums amounts, and quiet `"Undo"` action.

---

## Screen 2 — Overview Dashboard (Mobile, 390×844)

> Design the **Overview Dashboard** for **Budget Tracker** on Mobile (`390×844`) in the **Warm Editorial Ledger** light theme (`#FAF8F4` canvas, `#FFFFFF` cards, `#1B4332` forest pine, `#B4432C` terracotta, `#E5E0D6` 1px hairlines, zero emojis as UI icons, tabular-nums `₱` amounts).
>
> - **Top Header:** `"Overview"` (`24px` bold) + `"November 2026"`, right-aligned `"Export"` icon button and compact `"+ Entry"` pine pill.
> - **Safe to Spend Hero Card:** `"Safe to Spend"` with `"Safe & On Track"` badge, `"₱28,450.00"` (`34px` bold tabular-nums), `"₱4,064.29 / day for 7 days"`, collapsible `"How is this calculated?"` row.
> - **Net Worth Summary Card:** Compact segmented period switcher (`This Month` | `7 Days` | `All Time`), `"₱164,820.00"` Net Worth, 3-column Income / Expense / Cashflow strip on `#FFFFFF` paper.
> - **Accounts Horizontal Strip:** Scrollable warm cards (`BPI Savings`, `GCash`, `Maya`) with `"Manage"` and `"Reconcile"` links.
> - **Monthly Spending Target & Recent Activity:** Clean `6px` progress bar + 3 recent transaction rows separated by `1px` `#E5E0D6` hairlines.
> - **Native-style Bottom Tab Bar:** 5 crisp monochrome line-icon tabs (`Overview`, `Accounts`, `Expenses`, `Fast Entry`, `History`) with `#1B4332` active tint.

---

## Screen 3 — Fast Entry Calculator Capture (Mobile, 390×844)

> Design the **Fast Entry** transaction capture screen for **Budget Tracker** on Mobile (`390×844`), inspired by **Braun / Dieter Rams tactile instrumentation** within the **Warm Editorial Ledger** light palette (`#FAF8F4` canvas, `#FFFFFF` keys, `#F3F0EA` keypad housing, `#1B4332` pine, `#B4432C` terracotta, zero emojis as UI chrome).
>
> - **Header:** `"Fast Entry"` (`22px` bold) + `"Quick calculator capture"`, right-aligned hairline `"History"` button.
> - **Quick Presets Strip:** Compact horizontal chips (`Morning Coffee ₱165`, `Grab Ride ₱240`, `Groceries ₱1,500`) + `"+ Preset"` chip.
> - **Segmented Type Toggle:** Tactile 3-way switch inside `#F3F0EA` well: **Expense** (active terracotta `#B4432C` pill), **Income**, **Transfer**.
> - **Calculator Readout Display:** Clean framed readout showing live expression `"245 + 65"` in `JetBrains Mono` on top left, `"Keyboard"` indicator on top right, and bold `"−₱310.00"` (`36px` tabular-nums) below.
> - **Context Selectors:** Compact horizontal **From Account** selector (`BPI Savings`, `GCash`, `Cash`) + **Category** grid (`Dining`, `Groceries`, `Transit`, `Bills`, `Split`) + compact metadata bar (`Today`, `Merchant`, `#Tags`, `Note`, `Receipt`).
> - **Tactile 4×4 Keypad:** Crisp white `#FFFFFF` digit keys (`7 8 9`, `4 5 6`, `1 2 3`, `. 0 ⌫`) with `1px` `#E5E0D6` borders, warm stone operator column (`÷`, `×`, `−`, `+`) tinted `#EAF2EE` with `#1B4332` text, and bottom action row: `"Clear"` button + wide `"Save Expense · ₱310.00"` CTA in `#B4432C` (or `#1B4332` for income/transfer).

---

## Screen 4 — Expenses & Recurring Ledger (Desktop Web, 1440×900)

> Design the **Expenses & Recurring Ledger** screen for **Budget Tracker** on Desktop Web (`1440×900`) in the **Warm Editorial Ledger** light theme (`#FAF8F4` canvas, `#FFFFFF` surfaces, `#F3F0EA` sidebar rail, `#1B4332` pine, `#B4432C` terracotta, `#E5E0D6` hairlines, zero emojis as UI icons, max 1 status badge per row).
>
> - **Header:** `"Expenses"` (`28px` bold) + `"One-time expenses, recurring dues, and installment loans"`, right-aligned `"Fast Entry"` hairline button and `"+ Add Expense"` pine button.
> - **Segmented Tab Switcher:** `"Recorded (38)"` vs `"Recurring & Loans (5 due)"` (show the **Recurring & Loans** view or a clean split).
> - **Editorial Summary Strip (matching warm `#FFFFFF` paper — NOT dark black):** 4-column hairline KPI strip: `Projected Monthly Outflow ₱66,400.00`, `Monthly Budget Remaining ₱16,850.00`, `Scheduled Unpaid ₱18,250.00 (5 due)`, `Active Loan Balance ₱42,000.00`.
> - **Clean Filter Bar:** Search input with vector magnifying glass icon, status pills (`All`, `Unpaid`, `Paid`, `Loans`), account filter, `Cards | Table` toggle.
> - **Clean Commitment Cards / Ledger Rows:** 2-column grid of crisp commitment cards (`Home Fiber`, `Meralco Electric`, `Car Installment`, `Rent`): each shows a single clean status pill (`Due Nov 28` or `Overdue` or `Paid`), middot-separated metadata (`Utilities · BPI Savings · Monthly · Auto-pay`), tabular-nums amount (`₱2,499.00`), thin `4px` installment progress bar where applicable, and clean `"Pay & Deduct"` + `"Edit"` + `"Delete"` actions.

---

## Screen 5 — Accounts & Balance Reconciliation (Mobile, 390×844)

> Design the **Accounts & Balance Reconciliation** screen for **Budget Tracker** on Mobile (`390×844`) in the **Warm Editorial Ledger** light theme (`#FAF8F4` canvas, `#FFFFFF` cards, `#1B4332` pine, `#B4432C` terracotta, `#E5E0D6` hairlines, zero emojis as UI icons, tabular-nums `₱` amounts).
>
> - **Header:** `"Accounts"` + `"+ Add Account"` pine button.
> - **Warm Summary Strip (`#FFFFFF` with hairline dividers, NOT black):** `Total Balance ₱74,780.00`, `Liquid Cash ₱84,200.00`, `Credit Cards −₱9,420.00`.
> - **Filter Pills:** `All (4)`, `Bank (1)`, `E-Wallet (2)`, `Cash (0)`, `Credit Card (1)`.
> - **Account Ledger Rows:** Clean list items for `BPI Savings` (`Bank · ₱52,400.00`), `GCash` (`E-Wallet · ₱18,300.00`), `Maya` (`E-Wallet · ₱13,500.00`), each with hairline `"Reconcile"` and `"Edit"` buttons.
> - **Inline Balance Reconciliation Card (lower half preview):** Selected account `BPI Savings`, `"Calculated Balance ₱52,400.00"`, large numeric input `"Actual Statement Balance ₱ 52,150.00"`, quick nudge chips (`−₱50`, `−₱10`, `+₱10`, `+₱50`), live discrepancy notice (`"−₱250.00 discrepancy · App shows ₱250.00 more than statement"`), `"Create auto-adjustment transaction"` toggle, and pine `"Apply Reconciliation"` CTA.
