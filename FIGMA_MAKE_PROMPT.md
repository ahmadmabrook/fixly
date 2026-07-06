# Figma Make Prompt — Fixly UI/UX

> **Aligned with FIXLY_SYSTEM_DESIGN.md v1.6.** Covers the v1.5 business features (Fixly Certified trust tiers, Protection subscription, service-credit wallet, video pre-check quotes, conduct reports, arrival-SLA/late-compensation) and the v1.6 operating model (3-category launch scope, fixed-scope pricing with callout fee, service SOP scope, Ops Console views, technician scorecards).

> **How to use this:** Paste the whole thing for one shot, OR run it **app-by-app** if Make truncates. When running app-by-app, **always include the shared context — Sections 2–5 and 10–17** (design system, components, SF Symbols mapping, **data & status reference (§10)**, accessibility, deliverable, motion, copy, sample data, formats, tone) — followed by ONE app section (6, 7, 8, or 9). Start with **App 1 (Customer Mobile)**, the priority. Generate Arabic/RTL screens first; English is a mirror variant.

---

## 1. Project brief

Design a complete, production-quality UI/UX for **Fixly**, an on-demand home-maintenance platform for **Jordan (Amman)** — book a **Fixly Certified** technician for home maintenance.

**Launch (MVP) categories — design these first and most polished:** **Electricity (كهرباء), Plumbing (سباكة), AC (تكييف).** **Painting (دهان) and Furniture assembly (تركيب أثاث)** are in the catalogue but **Phase-2 / "coming soon"** — design them, but treat the 3 launch services as primary.

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
  - **Certification steps:** KYC/identity `person.text.rectangle.fill` · Documents `doc.fill` · Interview `person.wave.2.fill` · Practical test `checklist` · Training/SOP `graduationcap.fill` · Probation `hourglass` · Certified `checkmark.seal.fill`.
  - **Admin / Ops Console nav:** Dashboard `square.grid.2x2.fill` · Technicians `wrench.and.screwdriver.fill` · Quality & Trust `rosette` · Conduct reports `flag.fill` · Bookings `list.bullet.rectangle.fill` · Guarantee `checkmark.shield.fill` · Quotes `video.fill` · Subscriptions `star.circle.fill` · Support `bubble.left.and.bubble.right.fill` · Customers `person.2.fill` · Financial `chart.line.uptrend.xyaxis` · Broadcast `megaphone.fill` · Late orders `clock.badge.exclamationmark.fill` · High-risk `exclamationmark.triangle.fill` · Scorecard/KPIs `chart.bar.fill` / `gauge.medium`.
  - **States:** Empty (generic) `tray` · No results `magnifyingglass` · Offline/error `wifi.slash` / `exclamationmark.triangle` · Success `checkmark.circle.fill` · Coming soon `hourglass`.

**Trust & membership badges (design a badge set, using SF Symbols):**
- **Fixly Certified** — a `checkmark.seal.fill` chip in primary blue on every approved technician (card, profile, tracking). This is a core brand signal — make it recognizable.
- **Trust tier** (secondary, small): موثّق (Verified, `checkmark.seal`) blue · محترف (Pro, `rosette`) violet `#7C3AED` · نخبة (Elite, `crown.fill`) green `#15803D`. Probation techs never surface a tier to customers. Show tier as a subtle label/ring on the tech avatar, never louder than "Certified".
- **Protection member** — a small `star.circle.fill` chip "عضو الحماية" on the profile/home for subscribers (member state).

**Imagery:** friendly technician portraits, simple service illustrations/icons per category, light empty-state illustrations.

**Map styling:** clean, low-saturation light Google-Maps style (muted roads, soft greens/grays, hide POI clutter). Pins: **customer** = primary-blue location marker; **technician** = circular avatar inside a teal pin that moves/rotates smoothly along the route; **destination/address** = amber. ETA in a floating white pill with soft shadow.

**Logo & brand assets:** "Fixly" wordmark in primary blue with a small wrench/spark mark. Tagline (AR): **«فني محترف خلال 30 دقيقة»**. Also design a **splash screen** and a **web favicon**.

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
7. Home: greeting ("مرحباً أحمد"), location chip, **search**, **service grid**: the **3 launch services** first — كهرباء 50 دينار · سباكة 40 دينار · تكييف 30 دينار — then دهان 70 دينار · تركيب أثاث 35 دينار marked **«قريباً» (coming soon)**. Active-booking banner if any. **Service-credit balance chip** if the customer has credit ("رصيدك: 20 دينار"). Optional **Protection-plan promo strip** ("خطة الحماية — أولوية + خصم 15% + ضمان 90 يوم"). Trust strip: "فنيون معتمدون · ضمان 30 يوم · دعم 24/7".
8. Service detail: icon, name, **fixed price (big)**, est. duration, **«يشمل السعر» (what's included) and «لا يشمل» (what's NOT included) — the SOP scope** (§17.4), optional **package options for common cases** (e.g. «تركيب» vs «إصلاح»), an optional **callout/inspection-fee note** if applicable ("رسوم كشف 5 دنانير تُخصم من قيمة الإصلاح"), a **«فحص مرئي؟ احصل على سعر ثابت» (video pre-check)** entry point for uncertain jobs, "اطلب الآن".

**Booking flow** (target: ≤ 3 min, show a step indicator)
9. Time selection: **«فوراً (خلال 30 دقيقة)»** vs **«حجز لاحقاً»** (date/time picker).
10. Location picker: **Google Map** with draggable pin + "حدد موقعك", address text field, building/apartment, "ملاحظات (مثال: رمز البوابة 1234)".
11. Payment method: **Apple Pay / Google Pay / بطاقة (card)**, saved cards list, add card. Note: "لا دفع نقدي".
12. Review & confirm: service, time, address, **price breakdown** — service price, **callout fee (if any)**, **subscription discount −15% (if a member)**, promo discount, **service-credit applied (−, auto)**, **total to pay**. **Promo/discount code field** (apply + applied state). **Pre-authorization note** ("سيتم حجز المبلغ ويُخصم بعد إتمام الخدمة"), guarantee note, "تأكيد الحجز". *(No surprises: the total shown is what's held.)*
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
19. Service completed → prompt to rate.

**Post-service**
20. Rate technician: 5 stars, comment (optional), add before/after photos (optional), "إرسال".
21. Bookings list: tabs نشطة/سابقة, booking cards with status badges.
22. Booking detail / **e-receipt** (itemized, paid amount, technician, download/share); for **scheduled** bookings show **reschedule / cancel** actions.

**Guarantee (30-day)**
23. Guarantee home: explainer (**30 يوماً — 90 يوماً لأعضاء الحماية**) + list of eligible past bookings + open tickets.
24. Open guarantee ticket: pick booking, describe issue, **upload photo/video**, submit ("سيتم الرد خلال ساعتين").
25. Ticket status: timeline (مفتوح → قيد المراجعة → موافق/مرفوض → تم الحل), admin response, if approved "زيارة مجانية مجدولة".

**Account & support**
26. Profile: name, phone, edit; **Protection «عضو الحماية» member badge if subscribed**; **service-credit balance chip**; quick links to الحماية (Protection), المحفظة/الرصيد (Wallet), الفحص المرئي (Video pre-check), **«ادعُ صديقاً» (Referral — invite → both get service credit)**.
27. Saved addresses (add/edit/delete).
28. Payment methods (saved cards, default, remove).
29. Notifications list (booking accepted, technician nearby, completed, guarantee updates, **credit added, quote priced, subscription renewed**).
30. Support: **call button + in-app chat** ("الرد خلال 5 دقائق", Arabic), FAQ; **Protection members see a «دعم VIP» fast lane**.
31. Settings: language, notifications, terms/privacy, logout, delete account.

**Protection, Wallet & Video pre-check (v1.5)**
32. **Protection Plan «خطة الحماية»**: benefits list (أولوية خلال 30 دقيقة · خصم 15% على كل خدمة · ضمان ممتد 90 يوم · فحص مجاني كل 3 أشهر · دعم VIP), price "5 دنانير/شهر", **«اشترك الآن»** CTA. Member state: active card with **«يتجدد في 08/07/2026»** + **«إلغاء الاشتراك»** (cancel-at-period-end note: "ستبقى المزايا حتى نهاية الفترة"). Past-due state ("تعذّر التجديد — حدّث بطاقتك").
33. **Wallet / service credits «رصيدي»**: big balance ("20 دينار"), explainer ("يُخصم تلقائياً من فاتورتك القادمة"), history rows with reason labels (تعويض تأخير / إحالة / هدية / استخدام) and signed amounts (+/−).
34. **Video pre-check «الفحص المرئي»** — list of my quote requests + **«طلب جديد»**. New-request form: pick service, **upload/record the problem video**, description, location. Quote states: **بانتظار التسعير → مُسعّر (firm price shown) → مقبول**. On «مُسعّر», a card shows the **firm price** + **«اقبل واحجز» (accept → creates a booking at that exact price)**; expired/declined states too.

**Edge cases (design these):** no technicians available ("لا يوجد فنيون متاحون الآن"), payment failed + retry, booking cancelled/refunded, offline, location permission denied, **empty wallet ("لا يوجد رصيد بعد")**, **no quotes yet**, **subscription past-due / cancelled**.

---

## 7. APP 2 — TECHNICIAN MOBILE (RTL Arabic)

Bottom tabs: **الطلبات (Jobs) · الأرباح (Earnings) · حسابي (Profile)**.

1. Phone + OTP auth (same pattern).
2. **Fixly Certified onboarding** — a multi-step **certification stepper** (KYC هوية → المستندات المهنية → مقابلة → اختبار عملي → تدريب/SOP → قيد التجربة → معتمد): upload **ID, professional certificate, selfie** (camera + preview), **record an intro video «فيديو تعريفي»**, select services offered (multi-select — 3 launch categories), set hourly rate (40–60 دينار), and **accept the Fixly contractor agreement + conduct/off-platform rules (checkbox)** before submitting. Show which steps are done vs pending.
3. **Application status** screen: "طلبك قيد المراجعة — خلال 24 ساعة"; approved / rejected (with reason); **probation state «قيد التجربة — أول 10 طلبات»** with a short explainer (tighter dispatch, closer monitoring).
4. Home dashboard: **availability toggle (متاح/غير متاح)**, **trust-tier chip + Certified badge**, today's earnings, jobs count, **nearby job requests** (list + map). Probation techs see a "قيد التجربة" ribbon.
5. **Incoming job request**: service, distance, address area, **expected earnings for this job (payout after fee)**, **5-min accept countdown**, accept/reject. Warning state after 3 consecutive rejects.
6. Active job: customer location, navigate (open maps), call (masked), **«وصلت» (mark arrival)**, **«العميل لم يحضر» (mark customer no-show)**; then a **pre-start SOP checklist «قائمة ما قبل البدء»** must be confirmed + **capture «before» photos** where the SOP requires → **«بدء الخدمة»**.
7. In-progress: timer, **add additional work (description + price → sends to customer for in-app approval; not billable until approved)**; before finishing, a **pre-close SOP checklist «قائمة ما قبل الإغلاق»** + **«after» photos** → **«إنهاء الخدمة»**.
8. Completion: summary, request review, "تم".
9. Earnings: today / this month, balance, transactions list, **«سحب الرصيد»** (min 20 دينار, every 24h).
10. Withdraw: amount, bank/IBAN, confirm, status (requested/processing/paid).
11. Ratings received (from customers) + rate the customer (1–5, optional comment).
12. **Scorecard «أدائي»**: rating · **الالتزام بالوقت (lateness)** · **نسبة إعادة العمل/الضمان (redo/warranty rate)** · **نسبة الشكاوى (complaint rate)** · **نسبة القبول (acceptance)** · current trust tier + what lifts it. This is how the technician understands and improves standing.
13. Profile (intro video, credentials, Certified badge, insured flag), notifications, support.

**Edge cases:** account **suspended/blocked (e.g. after upheld off-platform reports)**, withdrawal below minimum / within 24h, no jobs nearby, going offline mid-shift, **probation limits reached**, certification step rejected (re-submit).

---

## 8. APP 3 — CUSTOMER WEB (responsive, RTL)

Reuse customer flows; add a marketing surface. Provide **desktop (1440)** and **mobile web (390)** layouts.
1. Landing/marketing: hero (tagline + CTA), value props (**Fixly Certified** / fixed price / 30-day guarantee / 30-min + late-comp / 24-7 support), services + prices (3 launch + 2 coming soon), how-it-works, **Protection-plan section**, trust/reviews, footer.
2. Login (phone + OTP).
3. Service catalog → service detail (**includes / not-included SOP scope**, callout-fee note, video-pre-check entry).
4. Booking flow (time, map location, payment) — desktop 2-column (form + **price breakdown incl. subscription discount + credits**).
5. Live tracking (map + status, **Certified tech card**, arrived + late-comp).
6. Account: bookings, receipts, guarantee, addresses, payment methods, support, **Protection plan, wallet/credits, video pre-check quotes**.

---

## 9. APP 4 — ADMIN / OPERATIONS CONSOLE (desktop web, can be LTR; data-dense)

This is a real **Ops Console** for running the city day-to-day, not a cosmetic admin. Left side-nav + top bar. Screens:
1. **Dashboard**: KPI cards (today's revenue, bookings, active technicians, avg rating, open guarantees) **+ operational KPIs (acceptance rate, avg time-to-assign, arrival delay, completion/cancellation rate, complaint rate, warranty/redo rate, repeat-booking rate)**, charts (revenue trend, bookings by service), live activity feed. **Operational panels: open orders · late orders (past arrival SLA) · high-risk orders (new customer + probation tech / high value / prior complaint) · cancellations.**
2. **Technicians**: table (status filters pending/approved/rejected/suspended), detail drawer (profile, **documents viewer**, **intro video**, ratings, **scorecard**), **approve / reject (with reason) / block**.
3. **Quality & Trust** (new): **trust-tier board** (probation/verified/pro/elite) with per-technician **background-check status**, **skills-test** action, **set/override tier**, insured flag, **off-platform flag count**; flags/complaints highlighted. Per-technician **daily performance / scorecard** view.
4. **Conduct reports** (new): queue of reports (off-platform / no-show / quality / safety / other) with filters (open/upheld/dismissed); **resolve → «تأكيد» (upheld, raises the tech's flags → possible demotion/suspension) / «رفض» (dismissed)**; confirmation dialog on upheld.
5. **Bookings**: **live map of active bookings** + table, filters by status (awaiting_payment/pending/confirmed/en_route/arrived/in_progress/completed/cancelled/disputed) **and by zone (شمال/وسط عمّان)**, detail (customer, technician, **event timeline (created → accepted → arrived → started → completed / complained / warranty-returned)**, payment, additional-work items).
6. **Guarantee tickets**: queue with SLA timer (2h), **review photos/video**, approve/reject + notes, schedule free visit.
7. **Video pre-check quotes** (new): queue (pending/quoted/accepted), **watch the problem video**, **set a firm price «تسعير»** on pending requests; shows which became bookings.
8. **Subscriptions** (new): active/past-due counts + **MRR**, list of Protection members with status + renewal date.
9. **Support & complaints**: inbox, conversation view, **canned replies (macros)**, **complaint categorization** (جودة / تأخير / تسعير / سلوك / سلامة / أخرى), **escalation** action, reply, resolve, process refund. Surface the SLAs: **first response ≤ 5 min**, guarantee decision ≤ 2h.
10. **Customers**: table, detail, block/unblock, **service-credit balance**, booking history.
11. **Financial reports**: revenue (daily/monthly), platform fees (20%), technician payouts, filters + date range, **export CSV**, charts.
12. **Broadcast notifications**: compose (title + body, Arabic), segment (all / customers / technicians), preview, send.
13. Admin auth (email + password), roles (super_admin / ops / finance / support) — role-gate the nav (e.g. Quality/Conduct/Quotes = OPS; Subscriptions = OPS/FINANCE; Financial = FINANCE).

Design dense but legible: sortable tables, status chips, filters, pagination, empty/loading states, confirmation dialogs for destructive actions and for upheld conduct reports / manual refunds / tier overrides.

---

## 10. Data, content & status reference (use exactly)

**Services & fixed prices:** **Launch (design first):** Electricity كهرباء 50 · Plumbing سباكة 40 · AC Cleaning تكييف 30. **Coming soon (Phase 2):** Painting دهان 70 · Furniture تركيب أثاث 35 — all in **دينار (JOD)**, fixed-scope, shown upfront. Fixed price = fixed **scope**; an optional **callout/inspection fee** and **customer-approved add-ons** are the only ways the total changes (never a silent surprise).

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

**Policy microcopy (surface where relevant):** **Cancellation** — "الإلغاء مجاني قبل انطلاق الفني؛ قد تُطبّق رسوم إلغاء بعد ذلك." · **No-show (customer)** — "لم يحضر العميل — قد تُطبّق رسوم كشف." · **Off-platform** — "أبقِ التعامل داخل التطبيق — الضمان والرصيد صالحان فقط للحجوزات داخل Fixly." · **Add-on approval** — "لن يُضاف أي مبلغ دون موافقتك." · **Referral** — "ادعُ صديقاً — يحصل كلاكما على رصيد خدمة."

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
- Wire the main happy-path flows so they click through: onboarding → book → pay → track (**arrived + late-comp**) → complete → rate; **video pre-check: request → priced → accept → book**; **subscribe to Protection → member state**; technician: **certify/onboard → approve** → receive → accept → **arrive** → start → complete → withdraw; admin: **vet technician (bg-check/skills/tier) · resolve conduct report · price a quote**.
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

**Primary buttons:** اطلب الآن · تأكيد الحجز · ادفع الآن · وصلت · العميل لم يحضر · بدء الخدمة · إنهاء الخدمة · إرسال · متابعة · تأكيد · إلغاء · إعادة المحاولة · سحب الرصيد · فتح تذكرة ضمان · اشترك الآن · إلغاء الاشتراك · طلب تسعير · اقبل واحجز · تسعير · الإبلاغ عن مشكلة · مشاهدة الفيديو التعريفي · ادعُ صديقاً · أوافق على الشروط.

**Empty states:** لا توجد حجوزات بعد — اطلب أول خدمة الآن · لا توجد إشعارات · لا توجد طلبات قريبة حالياً (tech) · أضف عنوانك الأول · لا يوجد رصيد بعد · لا توجد طلبات تسعير بعد · لا توجد بلاغات (admin).

**Errors / problems:**
- Network: "تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً."
- OTP wrong: "الرمز غير صحيح." · OTP expired: "انتهت صلاحية الرمز، اطلب رمزاً جديداً."
- Payment failed: "فشلت عملية الدفع. جرّب وسيلة دفع أخرى."
- No technicians: "لا يوجد فنيون متاحون الآن، حاول بعد قليل."
- Location off: "فعّل الموقع لتحديد عنوانك." · Generic: "حدث خطأ ما، حاول مرة أخرى."

**Toasts / confirmations:** تم تأكيد حجزك · تم إلغاء الحجز وإصدار المبلغ المسترد · شكراً لتقييمك · تم إرسال طلب السحب · تم الحفظ · تم تفعيل خطة الحماية · سيتم إلغاء الاشتراك في نهاية الفترة · تم إرسال طلب التسعير · تم إنشاء الحجز بالسعر المتفق عليه · تم استلام بلاغك · تمت إضافة 20 دينار إلى رصيدك (تعويض تأخير).

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
