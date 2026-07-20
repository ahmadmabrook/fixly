# Figma Make Prompt — Fixly UI/UX

> **Aligned with FIXLY_SYSTEM_DESIGN.md v1.13.** Covers the v1.5 business features (Fixly Certified trust tiers, Protection subscription, service-credit wallet, video pre-check quotes, conduct reports, arrival-SLA/late-compensation), the v1.6 operating model (3-category launch scope, fixed-scope pricing with callout fee, service SOP scope, Ops Console views, technician scorecards), and the **v1.7–v1.13 pricing & materials layer**: the two pricing archetypes (**`fixed_scope` instant booking vs `quote_first` itemized-offer booking — Painting has NO instant price**), the **itemized quote** (labour/materials/prep lines + tier choice + validity window), the **Bill of Materials (BOM)** approval + price-variance consent + invoice-photo transparency, materials policies (customer-supplied option, workmanship-only warranty boundary, micro-materials), the **emergency/night surcharge**, the **three-line invoice** (labour · materials · fees), price **bands + confidence labels**, and the new **Ops screens** (materials catalogue + staleness, BOM/variance review with 2-hour auto-fallback, 24-hour price-verification, price-index entry, category-readiness dashboard, supplier trial board, **founder one-tap mobile approvals**).

> **How to use this:** Paste the whole thing for one shot, OR run it **app-by-app** if Make truncates. When running app-by-app, **always include the shared context — Sections 2–5 and 10–17** (design system, components, SF Symbols mapping, **data & status reference (§10)**, accessibility, deliverable, motion, copy, sample data, formats, tone) — followed by ONE app section (6, 7, 8, or 9). Start with **App 1 (Customer Mobile)**, the priority. Generate Arabic/RTL screens first; English is a mirror variant.

---

## 1. Project brief

Design a complete, production-quality UI/UX for **Fixly**, an on-demand home-maintenance platform for **Jordan (Amman)** — book a **Fixly Certified** technician for home maintenance.

**Launch (MVP) categories — design these first and most polished:** **Electricity (كهرباء), Plumbing (سباكة), AC (تكييف).** **Painting (دهان) and Furniture assembly (تركيب أثاث)** are in the catalogue but **Phase-2 / "coming soon"** — design them, but treat the 3 launch services as primary.

**Two pricing archetypes (v1.7 — this changes how services are presented):**
- **`fixed_scope`** (Electricity, Plumbing, AC, Furniture): instant booking at the catalogue price shown up front.
- **`quote_first`** (Painting, and any materials-heavy work): **NEVER show an instant flat price.** The card shows **«حسب المعاينة»** (or a clearly-labelled *"ابتداءً من"* anchor) + a disclosed **inspection fee («رسوم معاينة 10 دنانير — تُخصم من قيمة المشروع عند القبول»)**. Flow: request → site photos/video + approximate dimensions + **material tier choice (اقتصادي / متوسط / ممتاز)** → an **itemized offer** (labour / materials / prep as separate lines, each material with brand + qty + unit price) → digital approval → the offer total becomes the **firm booking price** with a **validity window («العرض صالح 7 أيام»)**.

**Materials transparency (v1.9–v1.12 — design these as first-class moments, not fine print):** any job that consumes materials shows a **Bill of Materials before work starts** (line items the customer approves); a price **above the reference band** triggers a **side-by-side comparison + explicit consent screen**; the **shop invoice photo is visible to the customer in-app before final payment**; every receipt splits **أجور العمل · المواد · الرسوم** (three-line invoice); customers may choose **«سأوفر المواد بنفسي»** with a clear **workmanship-only warranty** acknowledgment.

**Launch platform reality (v1.9):** the launch surface is **Android + Ops/Admin + a simple landing/booking web** — one mobile design serves both platforms, but polish Android-pattern details first; the Ops Console must also work as **one-tap mobile approval views** (the operator is one person on a phone).

Brand promise (the **4 pillars** a customer must notice immediately): **① fixed, transparent prices (shown & locked before booking) · ② Fixly Certified technicians (vetted, badged, shown before arrival) · ③ a real 30-day guarantee with instant refund · ④ fast support (≤5-min response) + a fully digital flow (no cash to the technician).** Supporting promises: a professional technician within 30 minutes (with **automatic compensation if late**), and 24/7 Arabic support.

**Optional membership — "خطة الحماية" (Protection Plan, 5 دينار/شهر):** priority dispatch, **15% off every service**, extended **90-day** guarantee, a free quarterly inspection, and VIP support. Design its screens but treat it as a **Phase-2 / secondary** surface (do not push it aggressively at launch).

Design **four products**:
1. **Customer mobile app** (iOS + Android — one design) — PRIORITY
2. **Technician mobile app** (iOS + Android — one design)
3. **Customer web app** (responsive: desktop + mobile web)
4. **Admin / Operations panel** (desktop web) — a real **Ops Console**, not a cosmetic admin

**Language & direction:** **Arabic is primary and the default — full RTL layout.** Provide an English LTR variant where practical. All sample copy below is the real text to use (no lorem ipsum).

**Audience:** everyday households (non-technical, all ages) for the customer apps; working tradespeople for the technician app; an operations team for admin.

---

## 2. Design principles
- **Trust first** — clean, calm, credible. This app handles people's homes and money. Avoid clutter and gimmicks.
- **Speed & clarity** — booking must feel completable in under 3 minutes; one primary action per screen.
- **Price transparency** — the fixed price is always visible and unambiguous before booking. Never hide or hedge pricing.
- **Reassurance** — show technician identity, rating, live location, ETA, and the guarantee prominently.
- **Mobile-first**, thumb-friendly, large tap targets.
- **Inclusive** — works for low digital literacy: big labels, clear icons + text, minimal jargon.

---

## 3. Visual system

**Mood:** modern, friendly-professional, trustworthy, bright. Think a polished fintech-meets-services feel.

**Color palette (light theme):**
- Primary (brand) `#1366D6` — buttons, links, active states
- Primary dark `#0E4FA8`, Primary tint/bg `#E8F1FE`
- Secondary (teal) `#0FB5A6` — accents, success-ish highlights
- Accent (amber) `#F5A623` — promotions, ratings stars, attention
- Success `#1FAA59` · Warning `#F5A623` · Error `#E5484D` · Info `#1366D6`
- Ink/text `#0F172A` · Secondary text `#475569` · Muted `#94A3B8`
- Surface `#FFFFFF` · App background `#F6F8FB` · Border/divider `#E2E8F0`

**Dark theme:** background `#0B1220`, surface `#131C2E`, text `#E8EEF6`, keep primary `#3B82F6` for contrast. Provide both; deliver **light first**.

**Typography:**
- Arabic: **Tajawal** (fallback **Cairo**). Weights 400/500/700.
- Latin & numerals: **Inter**. Use **Western (Latin) numerals** for prices and times (e.g. "50 دينار", "5 دقائق").
- Type scale (mobile): Display 28/700, H1 22/700, H2 18/700, Body 15/400, Body-strong 15/600, Caption 13/400, Tiny 11/500. Generous line-height for Arabic (~1.6).

**Layout tokens:**
- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40 (8pt grid).
- Radius: cards 16, buttons 12, inputs 12, sheets 24 (top), chips full/999.
- Elevation: soft shadows only (y2 blur8 8% black; y8 blur24 12% for sheets/modals).
- Screen padding: 16–20 horizontal.

**Frames, breakpoints & grid:**
- Mobile frame **390×844** (design at 1x). Top app bar 56, bottom tab bar 64; respect status-bar/home-indicator safe areas.
- Web breakpoints: mobile < 640 · tablet 640–1024 · desktop > 1024. Desktop canvas **1440**, mobile-web **390**.
- Web/admin grid: 12 columns, 24 gutter, max content width 1200 (admin tables may go full-bleed).

**Iconography — use Apple SF Symbols as the icon system across all four apps.**
- **Icon set:** **SF Symbols** (Apple). Use SF Symbols everywhere an icon appears — nav, list rows, buttons, chips, KPI/stat cards, empty/error states, status badges, section headers, form fields, map controls. Prefer the **`.fill` / rounded** variants for a friendly-solid look consistent with this design; keep **one weight (Regular/Semibold) and one optical scale** across a screen. Match icon color to text/semantic tokens (primary blue for interactive, muted for decorative, semantic colors for status). For Android/web/admin, SF Symbols is the **design** reference; at build time map each to the nearest platform equivalent — but design with SF Symbols.
- **Use icons wherever they help comprehension and scanning — and always pick the single most semantically-appropriate SF Symbol** for the concept (don't settle for a loosely-related glyph). Pair **icon + text label** for anything important (never rely on an icon alone for meaning); icon-only is allowed for universally-clear affordances (back, close, search) with an `aria-label`. Do not over-decorate — one clear icon per row/action, not clusters.
- **RTL:** mirror directional symbols — use **`chevron.backward` / `chevron.forward`** (they flip with layout direction), `arrow.uturn.backward`, etc. Non-directional symbols are not mirrored.
- **SF Symbols mapping (use these exact symbol names; if unavailable, pick the closest SF Symbol of the same meaning):**
  - **Services:** Electricity `bolt.fill` · Plumbing `spigot.fill` (fallback `drop.fill`) · AC `air.conditioner.horizontal.fill` (fallback `snowflake`) · Painting `paintbrush.fill` · Furniture `sofa.fill`.
  - **Customer nav:** Home `house.fill` · Bookings `list.bullet.clipboard.fill` (or `calendar`) · Guarantee `checkmark.shield.fill` · Profile `person.fill`.
  - **Technician nav:** Jobs `briefcase.fill` · Earnings `wallet.bifold.fill` (fallback `banknote.fill`) · Profile `person.fill`.
  - **Feature icons:** Fixly Certified `checkmark.seal.fill` · Trust tier (Pro `rosette`, Elite `crown.fill`, Verified `checkmark.seal`) · Protection Plan / member `star.circle.fill` · Wallet / service credits `giftcard.fill` · Late-comp / referral reward `gift.fill` · Video pre-check `video.fill` · Report technician `flag.fill` · VIP support `headphones` · Off-platform warning `exclamationmark.triangle.fill` · Insured `cross.case.fill`.
  - **Actions & UI:** Search `magnifyingglass` · Masked call `phone.fill` · Message `message.fill` · Location / address `mappin.and.ellipse` · ETA / time `clock.fill` · Cancel / close `xmark.circle.fill` · Add `plus` / `plus.circle.fill` · Card `creditcard.fill` · OTP / secure `lock.fill` · Notifications `bell.fill` · Settings `gearshape.fill` · Logout `rectangle.portrait.and.arrow.forward` · Rating star `star.fill` · Recenter map `location.fill` · Upload doc `arrow.up.doc.fill` · Photo/video capture `camera.fill` / `video.badge.plus` · Availability toggle `power` · Withdraw `arrow.down.circle.fill`.
  - **Job lifecycle:** En route `figure.walk` · Arrived `mappin.circle.fill` · In progress `wrench.and.screwdriver.fill` · Completed `checkmark.circle.fill` · No-show `person.fill.xmark` · Pre-start/close SOP checklist `checklist` · Extra work `plus.rectangle.on.folder.fill`.
  - **Materials & pricing (v1.7–v1.12):** Bill of Materials `shippingbox.fill` · Material line `list.bullet.rectangle.portrait.fill` · Itemized quote `doc.text.fill` · Tier (economy/standard/premium) chips `paintpalette.fill` (painting) / plain chips elsewhere · Price band `arrow.left.and.right` · Variance compare `arrow.up.arrow.down.circle.fill` · Invoice photo `doc.viewfinder.fill` (capture `camera.viewfinder`) · Estimated price `questionmark.circle.fill` · Quote validity `timer` · Customer-supplied materials `person.crop.circle.badge.checkmark` · Substitution `arrow.triangle.2.circlepath` · Emergency/night surcharge `moon.fill` · Materials catalogue `book.closed.fill` · Price index (CPI/fuel) `chart.xyaxis.line` · Suppliers `storefront.fill` (fallback `building.2.fill`) · Readiness gauge `gauge.with.needle` (fallback `gauge.medium`).
  - **Certification steps:** KYC/identity `person.text.rectangle.fill` · Documents `doc.fill` · Interview `person.wave.2.fill` · Practical test `checklist` · Training/SOP `graduationcap.fill` · Probation `hourglass` · Certified `checkmark.seal.fill`.
  - **Admin / Ops Console nav:** Dashboard `square.grid.2x2.fill` · Technicians `wrench.and.screwdriver.fill` · Quality & Trust `rosette` · Conduct reports `flag.fill` · Bookings `list.bullet.rectangle.fill` · Guarantee `checkmark.shield.fill` · Quotes `video.fill` · Subscriptions `star.circle.fill` · Support `bubble.left.and.bubble.right.fill` · Customers `person.2.fill` · Financial `chart.line.uptrend.xyaxis` · Broadcast `megaphone.fill` · Late orders `clock.badge.exclamationmark.fill` · High-risk `exclamationmark.triangle.fill` · Scorecard/KPIs `chart.bar.fill` / `gauge.medium` · **Materials catalogue `book.closed.fill` · BOM/variance review `arrow.up.arrow.down.circle.fill` · Verifications `doc.viewfinder.fill` · Price index `chart.xyaxis.line` · Readiness `gauge.with.needle` · Suppliers `storefront.fill`**.
  - **States:** Empty (generic) `tray` · No results `magnifyingglass` · Offline/error `wifi.slash` / `exclamationmark.triangle` · Success `checkmark.circle.fill` · Coming soon `hourglass`.

**Trust & membership badges (design a badge set, using SF Symbols):**
- **Fixly Certified** — a `checkmark.seal.fill` chip in primary blue on every approved technician (card, profile, tracking). This is a core brand signal — make it recognizable.
- **Trust tier** (secondary, small): موثّق (Verified, `checkmark.seal`) blue · محترف (Pro, `rosette`) violet `#7C3AED` · نخبة (Elite, `crown.fill`) green `#15803D`. Probation techs never surface a tier to customers. Show tier as a subtle label/ring on the tech avatar, never louder than "Certified".
- **Protection member** — a small `star.circle.fill` chip "عضو الحماية" on the profile/home for subscribers (member state).

**Imagery:** friendly technician portraits, simple service illustrations/icons per category, light empty-state illustrations.

**Map styling:** clean, low-saturation light Google-Maps style (muted roads, soft greens/grays, hide POI clutter). Pins: **customer** = primary-blue location marker; **technician** = circular avatar inside a teal pin that moves/rotates smoothly along the route; **destination/address** = amber. ETA in a floating white pill with soft shadow.

**Logo & brand assets:** "Fixly" (فِكسلي) wordmark in primary blue with a small wrench/spark mark. **Official taglines (v1.8):** AR **«فِكسلي — فنيك القريب، ضمانك الحقيقي»** · EN **"Fixly — your nearby technician, real guarantee."** («فني محترف خلال 30 دقيقة» stays as a supporting promise line, not the tagline.) Also design a **splash screen** and a **web favicon**.

**App icon (design this as a hero deliverable — it is the first thing a customer sees in the store and on the home screen):**
- **Goal:** a **professional, production-ready, instantly recognizable, customer-grabbing** icon that looks great as a real published app and works in **marketing / App Store & Google Play listings** and ads. It must feel premium and trustworthy — this app handles people's homes and money.
- **Concept:** one **single, bold, simple mark** — a distinctive Fixly symbol (e.g. a clean wrench/spark or an "F"-mark integrated with a repair/spark motif). **No wordmark, no tagline, no photos, no fine detail** inside the icon — it must read at a glance.
- **Style:** flat, modern, confident. A solid **primary-blue (`#1366D6`) background** with the mark in white (or a subtle blue→teal `#1366D6`→`#0FB5A6` gradient version as an alt); optional soft depth, but **no heavy skeuomorphism, no drop shadows baked in, no gradients that muddy at small sizes**. High contrast, generous safe margins, centered mark on the icon grid.
- **Legibility:** must stay crisp and identifiable from **1024×1024 down to ~40×40** (home screen, Spotlight/search, notifications, settings). Test at tiny sizes; simplify until it survives.
- **Platform variants:** **iOS** — rounded-square ("squircle") master at **1024×1024**, plus iOS 18 **light / dark / tinted (monochrome)** variants. **Android** — **adaptive icon** with separate **foreground + background layers** (safe zone respected, works with circle/squircle/rounded masks) + a monochrome layer for themed icons. **Web** — favicon + PWA maskable icon.
- **Marketing-ready:** deliver the icon on a few **presentation backgrounds** (on a phone home-screen mockup, in an App Store search-result row, and as a standalone tile) so its shelf-appeal and thumb-stopping quality are obvious. Provide light + dark presentations.
- **Consistency:** the icon's mark should echo the Fixly logo mark and brand color so app icon, splash, favicon, and wordmark clearly belong to one identity.

---

## 4. Reusable components (build a Components/Styles page)
Buttons: Primary, Secondary (outline), Tertiary/Text, Destructive — sizes L/M/S — states default/hover/pressed/disabled/loading. Full-width primary CTA pattern.
Inputs: text field, phone field with +962 country prefix, **6-digit OTP input**, textarea (notes), dropdown/select, search field, toggle/switch, checkbox, radio, segmented control.
Selection: service card (icon + name + fixed price + duration), chips/filters, list item with leading icon + trailing chevron, address row.
Data display: **price badge** (prominent), rating stars + numeric, avatar (with verified check), status badge (colored per booking status — see §10), info banner, stat card (KPIs), money/earnings card.
Surfaces: top app bar (with back), bottom tab bar, **bottom sheet** (drag handle), modal/dialog, **toast/snackbar**, tooltip.
Feedback/states: **loading skeletons**, **empty state**, **error/offline state**, success checkmark animation, inline field error, full-screen spinner.
Maps: **map view component** with custom pins (customer pin, moving technician pin), ETA pill, recenter button, address marker + draggable picker.
Flow: **status stepper/timeline** (booking lifecycle), countdown timer (technician accept; ETA), progress bar.
Navigation: tab bar with **badges** (active-booking indicator, unread-notifications count) — Customer: Home, Bookings, Guarantee, Profile; Technician: Jobs, Earnings, Profile; admin side-nav.

Additional components: **rating input** (tappable stars), **photo/video uploader** (add tile + thumbnails + progress), **map address autocomplete** (search → suggestions), **date/time picker** (for scheduled bookings), **countdown ring** (technician accept / ETA), **price-breakdown row list**, **document upload tile** (technician onboarding), **KPI/stat card** + **chart blocks** (line/bar/donut) for admin, **data table** (sortable headers, row actions, bulk-select, pagination), **filter bar**, **date-range picker**.

New v1.5/v1.6 components: **Certified badge** + **trust-tier chip** (§3); **Protection-plan card** (benefits list + price + subscribe/manage CTA + member state); **service-credit / wallet card** (balance + history rows, signed +/− amounts); **credit-applied row** for the price breakdown; **subscription-discount row** for the price breakdown; **callout-fee row** + **"what's included / not included" (SOP scope) list** for service detail; **video pre-check quote card** (status: بانتظار التسعير → مُسعّر → مقبول, with the firm price + "اقبل واحجز" CTA); **video thumbnail/uploader** (problem-video + technician intro-video); **report-technician action + reason sheet** (off-platform / no-show / quality / safety); **technician scorecard block** (rating · lateness · redo/warranty rate · complaint rate · acceptance); **certification-status stepper** (KYC → docs → interview → practical test → probation → certified); **Ops-Console operational cards** (open orders, late orders, high-risk orders, per-technician daily performance).

New v1.7–v1.13 components (materials & pricing): **itemized-quote card** — line rows grouped **أجور العمل / مواد / تجهيز** with per-line description + qty + unit + amount, a **materials tier selector** (اقتصادي / متوسط / ممتاز — each tier states coats/brand-class in plain Arabic), quote **validity chip** («صالح حتى 15/07») and **inspection-fee-credited note**; **BOM line row** (material name + brand + qty + unit price + total + status chip) and **BOM approval sheet** («اعتماد المواد قبل البدء» — approve locks it); **price-variance consent card** — side-by-side **السعر المرجعي vs السعر المطلوب** + technician's reason + Approve/Decline (declining opens a verification state); **invoice-photo tile** (thumbnail → full-screen viewer; capture variant for the technician with «الفاتورة الأصلية مطلوبة» helper); **price-band display** (range "12–14 دينار", never a fake single number) + **price-confidence chip** (مؤكد / **تقديري — قابل للتأكيد الميداني** / قيد المراجعة); **customer-supplied-materials row** («سأوفر المواد بنفسي») with the **workmanship-only warranty acknowledgment** checkbox; **substitution row** (linked old→new line, same-or-higher tier only); **three-line invoice block** (أجور العمل · المواد · الرسوم → الإجمالي); **emergency-surcharge row** («رسوم طوارئ ليلية +10 دنانير» — its own line, disclosed before confirmation); **countdown pill** for review deadlines (2h BOM auto-resolve · 24h invoice verification); **readiness progress card** ("الدهان: 32/50 عرض · نزاعات 5% · انحراف 11% — **غير جاهز بعد**"); **catalogue-staleness chip** (آخر تحديث للسعر + متأخر warning); **supplier trial card** (shop name + 30-day countdown + the two verdict toggles: العمولة تُدفع؟ / تلاعب بالسعر؟).

Every component must have RTL and dark variants. Use design tokens, not hardcoded values. **All component icons use SF Symbols** (see §3 mapping) — pick the most semantically-fitting symbol, `.fill`/rounded variants, one weight per screen, directional symbols mirrored in RTL.

**Component specs (exact):** Button heights L 52 / M 44 / S 36, h-padding 20/16/12, label 15/600. Input height 52, radius 12, 1px border `#E2E8F0`, primary focus ring. OTP cell 48×56. Cards: 16 padding, 16 radius, soft shadow. Bottom sheet: top radius 24, drag handle 36×4 `#CBD5E1`. Tab bar 64h (icon 24 + label 11). App bar 56h. Chips 32h, 12 padding, full radius. Avatars 32/40/56. Primary CTA: full-width, 52h, **sticky above the safe area** on action screens.

---

## 5. Global states to include on every relevant screen
Loading (skeleton), empty, error/offline (with retry), success/confirmation, permission prompts (location, notifications), and disabled/blocked. Show these as variants, not just the happy path.

---

## 6. APP 1 — CUSTOMER MOBILE (priority, RTL Arabic)

Bottom tabs: **الرئيسية (Home) · حجوزاتي (Bookings) · الضمان (Guarantee) · حسابي (Profile)**.

**Auth & onboarding**
1. Splash (logo + tagline).
2. Onboarding carousel (3 slides: 30-min technician / fixed price / 30-day guarantee).
3. Language pick (العربية / English).
4. Phone entry (`+962` prefix, "أدخل رقم هاتفك"; consent line: **"بالمتابعة، أنت توافق على الشروط والأحكام وسياسة الخصوصية."**).
5. OTP verify (6-digit, "أدخل رمز التحقق", resend timer, "تم الإرسال عبر واتساب"). Auto-advance.
6. Allow-location + allow-notifications prompts (illustrated).

**Home & discovery**
7. Home: greeting ("مرحباً أحمد"), location chip, **search**, **service grid**: the **3 launch services** first — كهرباء 50 دينار · سباكة 40 دينار · تكييف 30 دينار — then **دهان «حسب المعاينة» (quote-first — NO flat price, v1.7)** · تركيب أثاث 35 دينار, both marked **«قريباً» (coming soon)**. Active-booking banner if any. **Service-credit balance chip** if the customer has credit ("رصيدك: 20 دينار"). Optional **Protection-plan promo strip** ("خطة الحماية — أولوية + خصم 15% + ضمان 90 يوم"). Trust strip: "فنيون معتمدون · ضمان 30 يوم · دعم 24/7".
8. Service detail — **two variants by archetype**:
   - **fixed_scope** (كهرباء/سباكة/تكييف): icon, name, **fixed price (big)**, est. duration, **«يشمل السعر» / «لا يشمل» — the SOP scope**, optional **package options** («تركيب» vs «إصلاح»), a **materials note per policy** (governed add-ons: "قطع بسيطة كالفيوز والعلبة تُضاف بأسعار معتمدة وبموافقتك" · micro-included: "المواد البسيطة ضمن السعر"), optional **callout-fee note**, a **«فحص مرئي؟ احصل على سعر ثابت»** entry point, "اطلب الآن".
   - **quote_first** (دهان): icon, name, **«حسب المعاينة» — no price**, **inspection-fee card** ("رسوم معاينة 10 دنانير — **تُخصم من قيمة المشروع عند قبول العرض**"), what the offer will itemize (أجور + مواد + تجهيز), **«اطلب عرض سعر»** CTA → quote-request flow (screen 34), plus a small "لماذا لا يوجد سعر فوري؟" explainer ("سعر الدهان يعتمد على المساحة والتجهيز ونوع الدهان — نعطيك عرضاً مفصلاً وثابتاً قبل البدء").

**Booking flow** (target: ≤ 3 min, show a step indicator)
9. Time selection: **«فوراً (خلال 30 دقيقة)»** vs **«حجز لاحقاً»** (date/time picker). **Night/emergency state (v1.8):** selecting an out-of-hours emergency slot surfaces a clear **«رسوم طوارئ ليلية +10 دنانير»** chip *before* continuing — the surcharge is its own labelled line, never folded into the price.
10. Location picker: **Google Map** with draggable pin + "حدد موقعك", address text field, building/apartment, "ملاحظات (مثال: رمز البوابة 1234)".
11. Payment method: **Apple Pay / Google Pay / بطاقة (card)**, saved cards list, add card. Note: "لا دفع نقدي".
12. Review & confirm: service, time, address, **price breakdown** — service price, **emergency surcharge (if night/emergency, own row)**, **callout fee (if any)**, **subscription discount −15% (if a member)**, promo discount, **service-credit applied (−, auto)**, **total to pay**. For quote-first bookings the breakdown is the **accepted itemized offer** (أجور / مواد / تجهيز) with the inspection-fee credit row. **Promo/discount code field** (apply + applied state). **Pre-authorization note** ("سيتم حجز المبلغ ويُخصم بعد إتمام الخدمة"), guarantee note, "تأكيد الحجز". *(No surprises: the total shown is what's held.)*
13. Payment handoff: wallet sheet (Apple/Google Pay) OR "جارٍ فتح صفحة الدفع الآمنة" (hosted checkout) → success. If the customer is a **Protection member**, surface the member badge + "خصم العضوية مُطبّق".

**Live booking & tracking**
14. Searching for technician (animated radar/pulse, "نبحث عن أقرب فني…", cancel).
15. Technician assigned (tech card: photo, name, **Fixly Certified badge + trust-tier chip**, rating, jobs done, vehicle, **«مشاهدة الفيديو التعريفي» (intro video) + «الشهادات» (credentials)**, "الفني في الطريق"). This is the trust moment — the customer sees who is coming *before* they arrive.
16. **Live tracking** (the hero screen): full Google Map, moving technician pin, **ETA pill ("5 دقائق")**, bottom sheet with tech info + Certified badge, **«اتصال» (masked call)**, message, **«إلغاء الحجز»** (with refund-policy note), **overflow «الإبلاغ عن مشكلة» (report)**, status stepper (…في الطريق → **وصل** → الخدمة جارية).
16a. **Arrived + late-compensation state**: when the technician marks arrival, show "الفني وصل". If arrival is **>30 min past the promised window**, show an automatic-credit banner: **"تأخر الفني — تم إضافة 20 دينار إلى رصيدك تلقائياً"** (no action needed; ties to the wallet, screen 33).
16b. **Cancel-booking flow**: reason picker (وصل الفني متأخراً / غيّرت رأيي / خطأ في الطلب / أخرى), **refund summary** per the cancellation policy — **free before the technician is en route; a small cancellation fee may apply after** (shown clearly) — confirm → "ملغاة + تم إصدار المبلغ المسترد" state.
16c. **Technician reviews** (open from the assigned-tech card → "عرض التقييمات"): rating summary + list of **verified reviews only** (optionally **video reviews** — Phase 2).
16d. **Report technician** (from the report action): reason sheet — **محاولة تعامل خارج التطبيق (off-platform) / لم يحضر / جودة سيئة / سلوك/سلامة / أخرى** + optional details → "تم استلام بلاغك، سيراجعه فريقنا". *(Reinforce the off-platform policy: keep everything on Fixly to keep your guarantee.)*
17. Service in progress ("الفني يعمل الآن", started time).
18. Additional-work approval (if technician adds work: itemized description + amount, **new total**, **approve/decline** — nothing is charged unless approved; §0.2 #3).
18a. **Bill of Materials approval (v1.9 — design as a hero trust moment):** before work starts on any materials job, a **«اعتماد المواد»** sheet lists every line — material name, **brand (the customer's choice, shown)**, qty, unit price, total — plus the customer-supply option state. Approve → **«تم اعتماد المواد — لا تغيير بعد الآن إلا بموافقتك»** (BOM locked). Include the **price-band/confidence chips** on lines that are estimates.
18b. **Price-variance consent (v1.10):** if a line exceeds the reference, a **side-by-side card** — **«السعر المرجعي 12 دينار» vs «السعر المطلوب 15 دينار»** — with the technician's stated reason (نوع خاص / ماركة مستوردة / صعوبة وصول), **«أوافق» / «لا أوافق»**. Declining shows: "فُتح طلب تحقق — سيُطلب من الفني إثبات السعر بفاتورة أصلية خلال 24 ساعة."
18c. **Invoice transparency (v1.11):** on the booking's materials view, each purchased material shows its **shop-invoice photo** (tap → full screen) **before final payment** — caption "فاتورة الشراء الأصلية".
18d. **Customer-supplied materials (v1.12):** choosing **«سأوفر المواد بنفسي»** (where the service allows it) shows the plain warning **"الضمان يغطي العمل فقط، وليس عيوب المواد"** + an acknowledgment checkbox; note the technician may decline unsuitable material.
19. Service completed → prompt to rate.

**Post-service**
20. Rate technician: 5 stars, comment (optional), add before/after photos (optional), "إرسال".
21. Bookings list: tabs نشطة/سابقة, booking cards with status badges.
22. Booking detail / **e-receipt** — the **three-line invoice (v1.12)**: **أجور العمل · المواد · الرسوم** → total, then per-material lines (with invoice-photo links) under المواد; paid amount, technician, **رقم الفاتورة الإلكترونية (JoFotara)**, download/share; for **scheduled** bookings show **reschedule / cancel** actions.

**Guarantee (30-day)**
23. Guarantee home: explainer (**30 يوماً — 90 يوماً لأعضاء الحماية**) + list of eligible past bookings + open tickets. **Warranty-boundary labels (v1.12):** each eligible booking shows its coverage — **«ضمان كامل»** (platform-governed materials) vs **«الضمان على العمل فقط — مواد العميل»** (customer-supplied), so a claim never starts with a definitional argument.
24. Open guarantee ticket: pick booking, describe issue, **upload photo/video**, submit ("سيتم الرد خلال ساعتين").
25. Ticket status: timeline (مفتوح → قيد المراجعة → موافق/مرفوض → تم الحل), admin response, if approved "زيارة مجانية مجدولة".

**Account & support**
26. Profile: name, phone, edit; **Protection «عضو الحماية» member badge if subscribed**; **service-credit balance chip**; quick links to الحماية (Protection), المحفظة/الرصيد (Wallet), عروض الأسعار (Quotes — screen 34), **«ادعُ صديقاً» (Referral — invite → both get service credit)**.
27. Saved addresses (add/edit/delete).
28. Payment methods (saved cards, default, remove).
29. Notifications list (booking accepted, technician nearby, completed, guarantee updates, **credit added, quote priced, subscription renewed**).
30. Support: **call button + in-app chat** ("الرد خلال 5 دقائق", Arabic), FAQ; **Protection members see a «دعم VIP» fast lane**.
31. Settings: language, notifications, terms/privacy, logout, delete account.

**Protection, Wallet & Video pre-check (v1.5)**
32. **Protection Plan «خطة الحماية»**: benefits list (أولوية خلال 30 دقيقة · خصم 15% على كل خدمة · ضمان ممتد 90 يوم · فحص مجاني كل 3 أشهر · دعم VIP), price "5 دنانير/شهر", **«اشترك الآن»** CTA. Member state: active card with **«يتجدد في 08/07/2026»** + **«إلغاء الاشتراك»** (cancel-at-period-end note: "ستبقى المزايا حتى نهاية الفترة"). Past-due state ("تعذّر التجديد — حدّث بطاقتك").
33. **Wallet / service credits «رصيدي»**: big balance ("20 دينار"), explainer ("يُخصم تلقائياً من فاتورتك القادمة"), history rows with reason labels (تعويض تأخير / إحالة / هدية / استخدام) and signed amounts (+/−).
34. **Quotes «عروض الأسعار» (video pre-check + quote-first, v1.7-upgraded)** — list of my quote requests + **«طلب جديد»**. New-request form: pick service, **upload/record photos+video of the site**, description, **approximate dimensions/rooms** («المساحة التقريبية أو عدد الغرف»), **material tier picker (اقتصادي / متوسط / ممتاز — each tier explains coats + brand class in plain Arabic)**, brand preference (optional), location; for quote-first services show the inspection-fee note. States: **بانتظار التسعير → مُسعّر → مقبول / منتهٍ / مرفوض**. On **«مُسعّر»**: the **itemized offer** — grouped lines **أجور العمل / المواد / التجهيز** (each material: name + brand + qty + unit price), the inspection-fee **credit row**, the **validity chip «العرض صالح حتى 15/07»**, total (big), **«اقبل واحجز»** (accept → booking at that exact firm total). **Expired state:** "انتهت صلاحية العرض — اطلب إعادة تسعير" (an expired offer can never be charged).

**Edge cases (design these):** no technicians available ("لا يوجد فنيون متاحون الآن"), payment failed + retry, booking cancelled/refunded, offline, location permission denied, **empty wallet ("لا يوجد رصيد بعد")**, **no quotes yet**, **subscription past-due / cancelled**, **expired quote («انتهت صلاحية العرض»)**, **BOM awaiting approval blocks work-start**, **variance declined → verification pending («بانتظار فاتورة الفني — 24 ساعة»)**, **estimated-price line («سعر تقديري — قابل للتأكيد الميداني»)**.

---

## 7. APP 2 — TECHNICIAN MOBILE (RTL Arabic)

Bottom tabs: **الطلبات (Jobs) · الأرباح (Earnings) · حسابي (Profile)**.

1. Phone + OTP auth (same pattern).
2. **Fixly Certified onboarding** — a multi-step **certification stepper** (KYC هوية → المستندات المهنية → مقابلة → اختبار عملي → تدريب/SOP → قيد التجربة → معتمد): upload **ID, professional certificate, selfie** (camera + preview), **record an intro video «فيديو تعريفي»**, select services offered (multi-select — 3 launch categories), set hourly rate (40–60 دينار), and **accept the Fixly contractor agreement + conduct/off-platform rules (checkbox)** before submitting. Show which steps are done vs pending.
3. **Application status** screen: "طلبك قيد المراجعة — خلال 24 ساعة"; approved / rejected (with reason); **probation state «قيد التجربة — أول 10 طلبات»** with a short explainer (tighter dispatch, closer monitoring).
4. Home dashboard: **availability toggle (متاح/غير متاح)**, **trust-tier chip + Certified badge**, today's earnings, jobs count, **nearby job requests** (list + map). Probation techs see a "قيد التجربة" ribbon.
5. **Incoming job request**: service, distance, address area, **expected earnings for this job (payout after fee)**, **5-min accept countdown**, accept/reject. Warning state after 3 consecutive rejects.
6. Active job: customer location, navigate (open maps), call (masked), **«وصلت» (mark arrival)**, **«العميل لم يحضر» (mark customer no-show)**; then a **pre-start SOP checklist «قائمة ما قبل البدء»** must be confirmed + **capture «before» photos** where the SOP requires → **«بدء الخدمة»**.
6a. **Draft the Bill of Materials (v1.9 — before starting any materials job):** a **catalogue picker** — the technician **selects items from the Fixly price book, never types a price** (search + category filter; each item shows tier, unit, and the *fixed* catalogue price), sets qty, records the **customer-chosen brand**; **micro-materials** below the threshold are marked "ضمن الأجرة" automatically. **Off-catalogue item** path: name + price + **mandatory invoice-photo capture** («الفاتورة الأصلية مطلوبة») — cannot submit without it. Variance states (two thresholds, v1.10): **>15% over reference** → the line flags «قيد المراجعة» automatically; **>20%** → additionally the technician **cannot submit without a reason** («أعلى من السعر المرجعي — اذكر السبب»: نوع خاص / ماركة مستوردة / صعوبة وصول / أخرى) and the customer must consent (screen §6.18b). Submit → "بانتظار اعتماد العميل" → locked once approved.
6b. **Substitution flow (v1.12):** replace a line only with **same-or-higher tier** («بديل بنفس الجودة أو أعلى»); links old→new; any price increase returns to customer approval.
7. In-progress: timer, **add additional work (description + price → sends to customer for in-app approval; not billable until approved)**; mid-job discovery follows **«توقّف عند نقطة آمنة واطلب موافقة»** (stop-at-safe-point rule — never continue-and-bill); before finishing, a **pre-close SOP checklist «قائمة ما قبل الإغلاق»** + **«after» photos** → **«إنهاء الخدمة»**.
8. Completion: summary, request review, "تم".
9. Earnings: today / this month, balance, transactions list, **«سحب الرصيد»** (min 20 دينار, every 24h).
10. Withdraw: amount, bank/IBAN, confirm, status (requested/processing/paid).
11. Ratings received (from customers) + rate the customer (1–5, optional comment).
12. **Scorecard «أدائي»**: rating · **الالتزام بالوقت (lateness)** · **نسبة إعادة العمل/الضمان (redo/warranty rate)** · **نسبة الشكاوى (complaint rate)** · **نسبة القبول (acceptance)** · current trust tier + what lifts it. This is how the technician understands and improves standing.
13. Profile (intro video, credentials, Certified badge, insured flag), notifications, support.

13a. **Price-verification request (v1.10):** when a customer disputes a material price — a card with the disputed line, **«ارفع صورة الفاتورة الأصلية»** uploader, and a **24-hour countdown**; overdue state: "لم تُرفع الفاتورة — تم خصم الفرق (3 دنانير) من مستحقاتك". Resolved states (مقبول / خُصم).

**Edge cases:** account **suspended/blocked (e.g. after upheld off-platform reports)**, withdrawal below minimum / within 24h, no jobs nearby, going offline mid-shift, **probation limits reached**, certification step rejected (re-submit), **BOM stuck at «بانتظار اعتماد العميل»**, **variance line rejected**, **verification deadline passed (deduction shown in earnings)**.

---

## 8. APP 3 — CUSTOMER WEB (responsive, RTL)

Reuse customer flows; add a marketing surface. Provide **desktop (1440)** and **mobile web (390)** layouts.
1. Landing/marketing: hero (tagline + CTA), value props (**Fixly Certified** / fixed price / 30-day guarantee / 30-min + late-comp / 24-7 support), services + prices (3 launch + 2 coming soon), how-it-works, **Protection-plan section**, trust/reviews, footer.
2. Login (phone + OTP).
3. Service catalog → service detail — **both archetype variants (§6.8)**: fixed_scope (price + SOP scope + materials-policy note + callout-fee note) and **quote_first (دهان: «حسب المعاينة» + inspection fee + «اطلب عرض سعر»)**; video-pre-check entry.
4. Booking flow (time incl. **emergency-surcharge chip**, map location, payment) — desktop 2-column (form + **price breakdown incl. surcharge, subscription discount + credits**; quote-first bookings show the accepted itemized offer).
5. Live tracking (map + status, **Certified tech card**, arrived + late-comp) + the **BOM approval / variance-consent / invoice-photo moments (§6.18a–c)** as web modals.
6. Account: bookings, **three-line receipts (أجور · مواد · رسوم + JoFotara no.)**, guarantee (with warranty-boundary labels), addresses, payment methods, support, **Protection plan, wallet/credits, quotes «عروض الأسعار»** (itemized-offer view same as §6.34).

---

## 9. APP 4 — ADMIN / OPERATIONS CONSOLE (desktop web, can be LTR; data-dense)

This is a real **Ops Console** for running the city day-to-day, not a cosmetic admin. Left side-nav + top bar. Screens:
1. **Dashboard**: KPI cards (today's revenue, bookings, active technicians, avg rating, open guarantees) **+ operational KPIs (acceptance rate, avg time-to-assign, arrival delay, completion/cancellation rate, complaint rate, warranty/redo rate, repeat-booking rate)**, charts (revenue trend, bookings by service), live activity feed. **Operational panels: open orders · late orders (past arrival SLA) · high-risk orders (new customer + probation tech / high value / prior complaint) · cancellations.**
2. **Technicians**: table (status filters pending/approved/rejected/suspended), detail drawer (profile, **documents viewer**, **intro video**, ratings, **scorecard**), **approve / reject (with reason) / block**.
3. **Quality & Trust** (new): **trust-tier board** (probation/verified/pro/elite) with per-technician **background-check status**, **skills-test** action, **set/override tier**, insured flag, **off-platform flag count**; flags/complaints highlighted. Per-technician **daily performance / scorecard** view.
4. **Conduct reports** (new): queue of reports (off-platform / no-show / quality / safety / other) with filters (open/upheld/dismissed); **resolve → «تأكيد» (upheld, raises the tech's flags → possible demotion/suspension) / «رفض» (dismissed)**; confirmation dialog on upheld.
5. **Bookings**: **live map of active bookings** + table, filters by status (awaiting_payment/pending/confirmed/en_route/arrived/in_progress/completed/cancelled/disputed) **and by zone (شمال/وسط عمّان)**, detail (customer, technician, **event timeline (created → accepted → arrived → started → completed / complained / warranty-returned)**, payment, additional-work items).
6. **Guarantee tickets**: queue with SLA timer (2h), **review photos/video**, approve/reject + notes, schedule free visit.
7. **Quotes (video pre-check + quote-first, v1.7-upgraded):** queue (pending/quoted/accepted/expired), **watch the problem media + read dimensions/tier**, then **build the itemized offer** — add lines (أجور عمل / مادة / تجهيز), material lines picked **from the catalogue at its fixed prices** (an off-catalogue or over-band line flags for review), totals compute automatically, set validity → **«إرسال العرض»**. An **ops-review interstitial** appears for offers over the threshold. Shows which offers became bookings and their price-deviation vs final (feeds the readiness gate, screen 17).
8. **Subscriptions** (new): active/past-due counts + **MRR**, list of Protection members with status + renewal date.
9. **Support & complaints**: inbox, conversation view, **canned replies (macros)**, **complaint categorization** (جودة / تأخير / تسعير / سلوك / سلامة / أخرى), **escalation** action, reply, resolve, process refund. Surface the SLAs: **first response ≤ 5 min**, guarantee decision ≤ 2h.
10. **Customers**: table, detail, block/unblock, **service-credit balance**, booking history.
11. **Financial reports**: revenue (daily/monthly), platform fees (20%), technician payouts, filters + date range, **export CSV**, charts.
12. **Broadcast notifications**: compose (title + body, Arabic), segment (all / customers / technicians), preview, send.
13. **Materials catalogue (v1.9–v1.12):** table per category — item (AR/EN), **subcategory, tier, brand, unit, price band (min–ref–max), quality floor, confidence (مؤكد/تقديري/قيد المراجعة), last-priced date with a staleness warning** («متأخر عن التحديث الشهري»); add/edit item; **allowed-services** tags. A **price-observations drawer** per item (shop, area, price, date).
14. **BOM & variance review (v1.10):** queue of material lines `pending_review` (over-band or off-catalogue) — each row shows line details, **reference vs requested**, the technician's reason, the invoice photo if any, **approve/reject**, and the **2-hour auto-resolve countdown** ("سيُعتمد تلقائياً بالحد الأقصى للسعر بعد 01:12"). 
15. **Price verifications (v1.10):** open disputes with the **24-hour deadline countdown**; states فاتورة مرفوعة / مقبول / **خُصم تلقائياً** (with the ledger deduction shown); overdue rows resolve themselves.
16. **Price index (v1.13):** the monthly-ritual entry page — CPI (عام + خدمات صيانة المسكن), fuel price, Chamber-of-Industry readings; each with period, value, source link; a **"re-based N catalogue items"** confirmation after saving; history table.
17. **Category readiness (v1.10):** per quote-first category, the gate readout — **"الدهان: 32/50 عرض مغلق · نزاعات 5% · انحراف سعري 11% — غير جاهز بعد"** with the three thresholds and a ready/blocked verdict; the category switch is disabled until state = ready.
18. **Suppliers (v1.11):** pilot-shop cards — name, area, categories, **agreement kind (شفهي/رسالة)**, referral commission %, **30-day trial countdown**, and the two verdict fields (**العمولة دُفعت؟ / لوحظ تلاعب بالسعر؟**) + trial notes; active/dropped states.
19. **Founder mobile approvals (v1.9 — REQUIRED, design as its own mini-surface):** every review queue above (BOM lines, verifications, quotes, technician docs, guarantee) must also exist as a **phone-width (390) one-tap deep-link view** — a push notification opens a single-item card with the key facts + **Approve / Reject** buttons and the auto-resolve countdown. The operator is one person on a phone; the desktop console is the *secondary* surface for these decisions.
20. Admin auth (email + password), roles (super_admin / ops / finance / support) — role-gate the nav (e.g. Quality/Conduct/Quotes/Materials/BOM/Verifications/Suppliers = OPS; Subscriptions = OPS/FINANCE; Financial + Price-index = FINANCE/OPS).

Design dense but legible: sortable tables, status chips, filters, pagination, empty/loading states, confirmation dialogs for destructive actions and for upheld conduct reports / manual refunds / tier overrides.

---

## 10. Data, content & status reference (use exactly)

**Services & pricing (v1.7 archetypes):** **Launch (design first, all `fixed_scope`):** Electricity كهرباء 50 · Plumbing سباكة 40 · AC Cleaning تكييف 30 — **دينار (JOD)**, shown upfront. **Coming soon (Phase 2):** Furniture تركيب أثاث 35 (`fixed_scope`) · **Painting دهان — `quote_first`: NO flat price, show «حسب المعاينة» + inspection fee 10 دنانير (credited to the project on acceptance)**. Fixed price = fixed **scope**; the total changes only via a disclosed **emergency surcharge (+10 دنانير ليلاً)**, an optional **callout/inspection fee**, **customer-approved add-ons**, or an **approved BOM/quote** — never a silent surprise. **Painting tiers (per m², all-in):** اقتصادي ~2 دينار/م² · متوسط ~3.2 دينار/م² · ممتاز ~5.5 دينار/م² (each tier states coats + brand class).

**Materials rules that shape UI (v1.9–v1.12):** materials are always **line items** (name + brand + qty + unit price) — never a lump "مواد: 60 دينار"; prices display as **bands** (e.g. "قاطع 16A: 3–7 دنانير حسب الماركة") with a **confidence chip** (مؤكد / تقديري — قابل للتأكيد الميداني / قيد المراجعة); the **brand is the customer's choice**; **every receipt** uses the three-line split **أجور العمل · المواد · الرسوم** + **رقم فاتورة JoFotara**; the **shop-invoice photo** is viewable in-app before final payment.

**BOM line status → label (AR):** pending → بانتظار الاعتماد (gray) · pending_review → قيد المراجعة (amber) · approved → معتمد (green) · declined → مرفوض (red) · replaced → مُستبدل (gray) · unused → غير مستخدم (gray) · locked → مُثبّت (blue).
**Material source → label:** technician_procured → شراء الفني · customer_supplied → مواد العميل (الضمان على العمل فقط) · platform_arranged → توريد المنصة.
**Verification status → label:** open → بانتظار الفاتورة (amber, 24h countdown) · invoice_provided → فاتورة مرفوعة (blue) · upheld → مقبول (green) · deducted → خُصم الفرق (red) · withdrawn → أُلغي (gray).

**Booking status → label (AR) → badge color** (matches the real system enum — there is no separate "searching" status; **pending** is the dispatchable/searching state):
- awaiting_payment → بانتظار الدفع → gray
- pending (being dispatched / searching) → جارٍ البحث عن فني → blue
- confirmed → تم القبول → blue
- en_route → الفني في الطريق → teal
- arrived → الفني وصل → teal
- in_progress → الخدمة جارية → amber
- completed → مكتملة → green
- cancelled → ملغاة → red
- disputed → نزاع → red

Dispatch is **broadcast-and-accept**: a job is offered to several nearby eligible technicians with a **5-minute accept countdown**, and the search **radius expands** each round until one accepts (probation technicians are limited to a tighter radius).

**Trust tier → label (AR) → color:** probation → تحت التجربة (not shown to customers) → amber · verified → موثّق → blue · pro → محترف → violet `#7C3AED` · elite → نخبة → green. **Certified** = "فني معتمد" badge on every approved technician.

**Subscription status:** active → فعّال (green) · past_due → متأخر (amber) · cancelled → ملغى (gray) · expired → منتهٍ (gray). **Plan:** خطة الحماية — 5 دنانير/شهر (priority · 15% off · 90-day guarantee · quarterly free inspection · VIP support).

**Quote (video pre-check) status:** pending → بانتظار التسعير (amber) · quoted → مُسعّر (green) · accepted → مقبول (blue) · declined/expired → مرفوض/منتهٍ (gray).

**Conduct-report kind:** off_platform_solicit → محاولة خارج المنصة · no_show → عدم حضور · quality → جودة · safety → سلامة · other → أخرى.

**Service-credit reason:** late_compensation → تعويض تأخير · referral → إحالة · goodwill → هدية · promo → عرض · redemption → استخدام (شراء). **Late-compensation amount:** 20 دينار (auto, if technician >30 min late).

**Payment methods:** Apple Pay, Google Pay, بطاقة (Visa/Mastercard). No cash. "دفع آمن 100%".
**OTP delivery:** "تم إرسال الرمز عبر واتساب" (SMS fallback).
**Trust signals to surface:** **«فني معتمد» (Fixly Certified)**, ratings (4.5+), "ضمان 30 يوم" (90 for members), "دعم 24/7", masked phone number for calls, technician intro video + credentials.
**Currency format:** "50 دينار" (Western numerals). **ETA:** "5 دقائق".
**Pre-auth hold:** "سيتم حجز المبلغ الآن ويُخصم بعد إتمام الخدمة." · **Refund:** "تم إصدار المبلغ المسترد." · **Promo:** "أدخل رمز الخصم" · **Verified review badge:** "تقييم موثّق" · **Credit applied:** "تم خصم رصيدك" · **Member discount:** "خصم العضوية −15%".

**Policy microcopy (surface where relevant):** **Cancellation** — "الإلغاء مجاني قبل انطلاق الفني؛ قد تُطبّق رسوم إلغاء بعد ذلك." · **No-show (customer)** — "لم يحضر العميل — قد تُطبّق رسوم كشف." · **Off-platform** — "أبقِ التعامل داخل التطبيق — الضمان والرصيد صالحان فقط للحجوزات داخل Fixly." · **Add-on approval** — "لن يُضاف أي مبلغ دون موافقتك." · **Referral** — "ادعُ صديقاً — يحصل كلاكما على رصيد خدمة." · **Materials (v1.9–v1.12):** "المواد بأسعار معتمدة من Fixly — الفني لا يحدد السعر." · "لن يبدأ العمل قبل اعتمادك لقائمة المواد." · "أي زيادة عن السعر المرجعي تحتاج موافقتك — وسترى الفاتورة الأصلية." · **Quote-first** — "معاينة واضحة وسعر نهائي مفصّل قبل البدء — المواد مبيّنة بشفافية، ولا أي زيادة بدون موافقتك." · **Customer-supplied** — "الضمان يغطي العمل فقط، وليس عيوب المواد." · **Emergency** — "رسوم طوارئ ليلية +10 دنانير — تظهر كبند مستقل."

---

## 11. Accessibility & quality bar
- WCAG 2.1 AA contrast on all text/controls.
- Touch targets ≥ 44×44pt.
- Full RTL correctness (layout mirrored, text right-aligned, directional icons flipped); numerals stay LTR.
- Support large/dynamic text; don't truncate Arabic.
- Clear focus/selected states; never rely on color alone for status (icon + label too).

---

## 12. Deliverable
- A **connected, navigable prototype** organized into pages: **0. Design System / Components** (include a **Brand** frame with the **app icon** — production-ready, marketing-grade, iOS + Android-adaptive + web, with the light/dark/tinted variants and the marketing presentation mockups per §3), **1. Customer Mobile**, **2. Technician Mobile**, **3. Customer Web**, **4. Admin / Ops Console**.
- **Light theme + Arabic/RTL first**; include dark-theme and key English/LTR variants of the main screens.
- Include all **states** (loading/empty/error/success) for hero screens (home, booking flow, tracking, guarantee, earnings, **Protection plan, wallet, video pre-check**, admin tables, **Quality/Conduct queues**).
- Wire the main happy-path flows so they click through: onboarding → book → pay → track (**arrived + late-comp**) → complete → rate; **quote-first: request (media + dimensions + tier) → itemized offer → accept → book at the firm total**; **materials: technician drafts BOM → customer approves → (variance consent →) work → invoice photo → three-line receipt**; **subscribe to Protection → member state**; technician: **certify/onboard → approve** → receive → accept → **arrive** → **draft BOM** → start → complete → withdraw (**+ the 24h verification state**); admin: **vet technician (bg-check/skills/tier) · resolve conduct report · price a quote · review a variance line (2h countdown) · record the monthly price index · read the category-readiness gate**; **founder mobile: notification → one-tap approve/reject**.
- Consistent use of the design tokens and components defined above.
- **Icons: SF Symbols throughout** (§3 mapping), used wherever they aid comprehension, always the most suitable symbol, paired with labels, mirrored in RTL.

Make it feel like a real, shippable Jordanian consumer app: warm, trustworthy, fast, unmistakably Arabic-first.

---

## 13. Motion & micro-interactions
- Durations: micro 120ms, standard 220ms, emphasis 320ms. Easing: ease-out (enter), ease-in-out (move).
- Searching-for-technician: pulsing radar rings around the user pin (loop ~1.5s).
- Technician pin animates **along the route** (no jumps); camera follows smoothly.
- ETA countdown ticks; gentle teal→green shift as "arriving".
- Success (booking/payment): checkmark draw-on + light haptic.
- Buttons: pressed scale 0.98; loading = inline spinner replacing the label.
- Sheets/modals: slide-up + fade scrim. Toasts: slide-in from top, auto-dismiss 3s.
- Skeleton shimmer while loading; tab switches cross-fade. Keep motion subtle and fast.

---

## 14. Microcopy deck (Arabic — use verbatim)

**Primary buttons:** اطلب الآن · تأكيد الحجز · ادفع الآن · وصلت · العميل لم يحضر · بدء الخدمة · إنهاء الخدمة · إرسال · متابعة · تأكيد · إلغاء · إعادة المحاولة · سحب الرصيد · فتح تذكرة ضمان · اشترك الآن · إلغاء الاشتراك · طلب تسعير · **اطلب عرض سعر** · اقبل واحجز · تسعير · الإبلاغ عن مشكلة · مشاهدة الفيديو التعريفي · ادعُ صديقاً · أوافق على الشروط · **اعتماد المواد · أوافق على السعر · لا أوافق · ارفع الفاتورة · استبدال المادة · اعتمد (admin) · ارفض (admin)**.

**Empty states:** لا توجد حجوزات بعد — اطلب أول خدمة الآن · لا توجد إشعارات · لا توجد طلبات قريبة حالياً (tech) · أضف عنوانك الأول · لا يوجد رصيد بعد · لا توجد طلبات تسعير بعد · لا توجد بلاغات (admin).

**Errors / problems:**
- Network: "تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً."
- OTP wrong: "الرمز غير صحيح." · OTP expired: "انتهت صلاحية الرمز، اطلب رمزاً جديداً."
- Payment failed: "فشلت عملية الدفع. جرّب وسيلة دفع أخرى."
- No technicians: "لا يوجد فنيون متاحون الآن، حاول بعد قليل."
- Location off: "فعّل الموقع لتحديد عنوانك." · Generic: "حدث خطأ ما، حاول مرة أخرى."

**Toasts / confirmations:** تم تأكيد حجزك · تم إلغاء الحجز وإصدار المبلغ المسترد · شكراً لتقييمك · تم إرسال طلب السحب · تم الحفظ · تم تفعيل خطة الحماية · سيتم إلغاء الاشتراك في نهاية الفترة · تم إرسال طلب التسعير · تم إنشاء الحجز بالسعر المتفق عليه · تم استلام بلاغك · تمت إضافة 20 دينار إلى رصيدك (تعويض تأخير) · **تم اعتماد قائمة المواد — لن تتغير إلا بموافقتك · تم فتح طلب تحقق من السعر · تم رفع الفاتورة · خُصم الفرق من مستحقات الفني · انتهت صلاحية العرض — اطلب إعادة تسعير**.

**Destructive confirms:** "هل أنت متأكد من إلغاء الحجز؟" · "تسجيل الخروج؟" · "حذف الحساب نهائياً؟ لا يمكن التراجع." · "إلغاء خطة الحماية؟ ستبقى المزايا حتى نهاية الفترة." · (admin) "تأكيد البلاغ؟ سيُحتسب على الفني مخالفة قد تخفّض فئته."

**Push notifications:**
- "تم قبول حجزك ✅ الفني في الطريق"
- "الفني على بُعد 5 دقائق 🚗"
- "الفني وصل — الخدمة ستبدأ الآن"
- "تأخر الفني — أضفنا 20 دينار إلى رصيدك 🎁"
- "تم إكمال الخدمة — قيّم تجربتك ⭐"
- "تم تسعير طلبك — راجع العرض واحجز"
- "تحديث على طلب الضمان الخاص بك"
- "تم تجديد اشتراك الحماية"
- Tech: "طلب جديد قريب منك — اقبل خلال 5 دقائق"
- Tech: "تم اعتمادك كفني Fixly ✅" / "أنت الآن قيد التجربة — أول 10 طلبات"

**Support:** "نحن هنا لمساعدتك 24/7" · "الرد خلال 5 دقائق" · (member) "دعم VIP — أولوية في الرد".

---

## 15. Sample / seed content (use realistic Jordanian data — no placeholders)
- **Customer names:** أحمد العلي، سارة خالد، محمد الزعبي، رنا حدّاد، يوسف العمري.
- **Technician names + ratings:** خالد المومني ⭐4.9 (320 خدمة)، عمر الشريف ⭐4.7 (180)، سامي النسور ⭐4.8 (95).
- **Amman districts:** عبدون، الصويفية، خلدا، دير غبار، تلاع العلي، الجبيهة، مرج الحمام، الدوار السابع.
- **Sample addresses:** "خلدا، شارع وصفي التل، عمارة 12، ط2" · "الصويفية، دوار باريس، عمارة 5".
- **Phone:** +962 79 000 0000 (mask in calls as 079 0••• ••00).
- **Sample active booking:** كهرباء — 50 دينار — فوراً — خلدا — **الفني خالد (فني معتمد ⭐4.9) على بُعد 5 دقائق**.
- **Sample earnings (tech):** اليوم 85 دينار · هذا الشهر 1,240 دينار · الرصيد 310 دينار.
- **Sample technician scorecard:** التقييم 4.8 · الالتزام بالوقت 96% · نسبة إعادة العمل 3% · نسبة الشكاوى 2% · نسبة القبول 88% · الفئة: محترف.
- **Sample Protection member:** رنا حدّاد — عضو الحماية — يتجدد 08/07/2026 — وفّرت 18 دينار هذا الشهر.
- **Sample wallet:** الرصيد 20 دينار — (+20 تعويض تأخير، 06/06/2026) · (+5 إحالة صديق) · (−5 استخدام على حجز سباكة).
- **Sample video quote:** تكييف — «الوحدة لا تبرّد» — الحالة: مُسعّر — السعر الثابت 45 دينار.
- **Sample itemized painting offer (quote-first):** دهان غرفة نوم — أجور العمل 45 دينار · برايمر (1 غالون) 12 دينار · دهان متوسط (2 غالون) 36 دينار · معجون وتجهيز 8 دنانير · مواد حماية 4 دنانير — **الإجمالي 105 دنانير (ثابت)** · العرض صالح حتى 15/07 · رسوم المعاينة 10 دنانير مخصومة.
- **Sample BOM (electrical):** قاطع ABB 16A (اختيار العميل) ×1 — 6 دنانير · سلك 2.5مم ×3م — 1.8 دينار · علبة كهرباء ×1 — 0.9 دينار — بانتظار الاعتماد.
- **Sample variance case:** سيفون — السعر المرجعي 6 دنانير · المطلوب 8 دنانير · السبب: ماركة مستوردة → موافقة العميل / طلب تحقق (عدّاد 24 ساعة).
- **Sample catalogue rows:** دهان داخلي متوسط — دلو — 15–21 دينار (مرجعي 18) — مؤكد — آخر تحديث 01/07 · قاطع 16A — قطعة — 3–7 دنانير حسب الماركة — تقديري.
- **Sample readiness readout:** الدهان — 32/50 عرض مغلق · نزاعات 5% · انحراف 11% — **غير جاهز بعد**.
- **Sample supplier trial:** محل النور للكهربائيات — تلاع العلي — عمولة 6% — اتفاق شفهي — اليوم 18/30 — العمولة تُدفع ✓ · تلاعب بالسعر ✗.
- Use ratings in the 4.5–4.9 range; dates like 08/06/2026.

---

## 16. Localization & formats
- **RTL** for Arabic; provide an **LTR** English mirror for the hero screens.
- Numerals: **Western (0–9)** everywhere (prices, OTP, phone, dates).
- Currency: "50 دينار" (English: "JOD 50") — always pair amount with currency.
- Date: DD/MM/YYYY (08/06/2026). Time: 12-hour with **ص/م** (3:30 م).
- Phone: +962, 9-digit local; masked in calls.
- Never truncate Arabic — let text grow; keep English variants close in width.

---

## 17. Voice & tone (Arabic)
Warm, respectful, simple, reassuring — Modern Standard Arabic, short sentences, no slang, no heavy jargon. Greet politely ("مرحباً"، "من فضلك"). Lead with the benefit (price, speed, guarantee). Confirmations are friendly and brief; errors are calm and always offer a next step; never blame the user ("حدث خطأ" not "أنت أخطأت").
