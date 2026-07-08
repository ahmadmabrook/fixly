# Figma Make Prompt — Fixly UI/UX

> **How to use this:** Paste the whole thing for one shot, OR run it **app-by-app** if Make truncates. When running app-by-app, **always include the shared context — Sections 2–5 and 13–17** (design system, components, motion, copy, sample data, formats, tone) — followed by ONE app section (6, 7, 8, or 9). Start with **App 1 (Customer Mobile)**, the priority. Generate Arabic/RTL screens first; English is a mirror variant.

---

## 1. Project brief

Design a complete, production-quality UI/UX for **Fixly**, an on-demand home-maintenance platform for **Jordan (Amman)** — book a vetted technician for **Electricity, Plumbing, AC, Painting, Furniture assembly**.

Brand promise: **a professional technician within 30 minutes, fixed transparent prices, digital payment only (no cash to the technician), 24/7 Arabic support, and a 30-day guarantee with refund.**

Design **four products**:
1. **Customer mobile app** (iOS + Android — one design) — PRIORITY
2. **Technician mobile app** (iOS + Android — one design)
3. **Customer web app** (responsive: desktop + mobile web)
4. **Admin panel** (desktop web)

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

**Iconography:** rounded, 2px stroke, consistent set (e.g. Lucide/Phosphor style). Mirror directional icons (back/forward/chevrons) in RTL.
- Service icons: Electricity = bolt/zap, Plumbing = pipe/droplet+wrench, AC = snowflake/air-vent, Painting = paint-roller, Furniture = sofa/screwdriver.
- Nav icons: Home = house, Bookings = clipboard/list, Guarantee = shield-check, Profile = user; Technician: Jobs = briefcase, Earnings = wallet.

**Imagery:** friendly technician portraits, simple service illustrations/icons per category, light empty-state illustrations.

**Map styling:** clean, low-saturation light Google-Maps style (muted roads, soft greens/grays, hide POI clutter). Pins: **customer** = primary-blue location marker; **technician** = circular avatar inside a teal pin that moves/rotates smoothly along the route; **destination/address** = amber. ETA in a floating white pill with soft shadow.

**Logo & brand assets:** "Fixly" wordmark in primary blue with a small wrench/spark mark. Tagline (AR): **«فني محترف خلال 30 دقيقة»**. Also design: **app icon** (mark on primary-blue, iOS + Android adaptive), **splash screen**, and a **web favicon**.

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

Every component must have RTL and dark variants. Use design tokens, not hardcoded values.

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
4. Phone entry (`+962` prefix, "أدخل رقم هاتفك").
5. OTP verify (6-digit, "أدخل رمز التحقق", resend timer, "تم الإرسال عبر واتساب"). Auto-advance.
6. Allow-location + allow-notifications prompts (illustrated).

**Home & discovery**
7. Home: greeting ("مرحباً أحمد"), location chip, **search**, **service grid (5 services with fixed prices)**: كهرباء 50 دينار · سباكة 40 دينار · تكييف 30 دينار · دهان 70 دينار · تركيب أثاث 35 دينار. Active-booking banner if any. Promo banner. "دعم 24/7".
8. Service detail: icon, name, **fixed price (big)**, est. duration, what's included, "اطلب الآن".

**Booking flow** (target: ≤ 3 min, show a step indicator)
9. Time selection: **«فوراً (خلال 30 دقيقة)»** vs **«حجز لاحقاً»** (date/time picker).
10. Location picker: **Google Map** with draggable pin + "حدد موقعك", address text field, building/apartment, "ملاحظات (مثال: رمز البوابة 1234)".
11. Payment method: **Apple Pay / Google Pay / بطاقة (card)**, saved cards list, add card. Note: "لا دفع نقدي".
12. Review & confirm: service, time, address, **price breakdown (fixed price, no surprises)**, **promo/discount code field** (apply + applied state), **pre-authorization note** ("سيتم حجز مبلغ 50 دينار ويُخصم بعد إتمام الخدمة"), guarantee note, "تأكيد الحجز". 
13. Payment handoff: wallet sheet (Apple/Google Pay) OR "جارٍ فتح صفحة الدفع الآمنة" (hosted checkout) → success.

**Live booking & tracking**
14. Searching for technician (animated radar/pulse, "نبحث عن أقرب فني…", cancel).
15. Technician assigned (tech card: photo, name, rating, jobs done, vehicle, "الفني في الطريق").
16. **Live tracking** (the hero screen): full Google Map, moving technician pin, **ETA pill ("5 دقائق")**, bottom sheet with tech info, **«اتصال» (masked call)**, message, **«إلغاء الحجز»** (with refund-policy note), status stepper.
16b. **Cancel-booking flow**: reason picker (وصل الفني متأخراً / غيّرت رأيي / خطأ في الطلب / أخرى), **refund summary** (amount returned per policy), confirm → "ملغاة + تم إصدار المبلغ المسترد" state.
16c. **Technician reviews** (open from the assigned-tech card → "عرض التقييمات"): rating summary + list of **verified reviews only**.
17. Service in progress ("الفني يعمل الآن", started time).
18. Additional-work approval (if technician adds work: itemized, new total, approve/decline).
19. Service completed → prompt to rate.

**Post-service**
20. Rate technician: 5 stars, comment (optional), add before/after photos (optional), "إرسال".
21. Bookings list: tabs نشطة/سابقة, booking cards with status badges.
22. Booking detail / **e-receipt** (itemized, paid amount, technician, download/share); for **scheduled** bookings show **reschedule / cancel** actions.

**Guarantee (30-day)**
23. Guarantee home: explainer + list of eligible past bookings + open tickets.
24. Open guarantee ticket: pick booking, describe issue, **upload photo/video**, submit ("سيتم الرد خلال ساعتين").
25. Ticket status: timeline (مفتوح → قيد المراجعة → موافق/مرفوض → تم الحل), admin response, if approved "زيارة مجانية مجدولة".

**Account & support**
26. Profile: name, phone, edit.
27. Saved addresses (add/edit/delete).
28. Payment methods (saved cards, default, remove).
29. Notifications list (booking accepted, technician nearby, completed, guarantee updates).
30. Support: **call button + in-app chat** ("الرد خلال 5 دقائق", Arabic), FAQ.
31. Settings: language, notifications, terms/privacy, logout, delete account.

**Edge cases (design these):** no technicians available ("لا يوجد فنيون متاحون الآن"), payment failed + retry, booking cancelled/refunded, offline, location permission denied.

---

## 7. APP 2 — TECHNICIAN MOBILE (RTL Arabic)

Bottom tabs: **الطلبات (Jobs) · الأرباح (Earnings) · حسابي (Profile)**.

1. Phone + OTP auth (same pattern).
2. Onboarding / document upload: **ID, certificate (optional), selfie** (camera + preview), select services offered (multi-select), set hourly rate (40–60 دينار).
3. **Pending approval** screen ("طلبك قيد المراجعة — خلال 24 ساعة"). Approved / rejected (with reason) states.
4. Home dashboard: **availability toggle (متاح/غير متاح)**, today's earnings, jobs count, **nearby job requests** (list + map).
5. **Incoming job request**: service, distance, address area, **price**, **5-min accept countdown**, accept/reject. Warning state after 3 consecutive rejects.
6. Active job: customer location, navigate (open maps), call (masked), **«بدء الخدمة»**.
7. In-progress: timer, add additional work (item + price → sends to customer), **«إنهاء الخدمة»**.
8. Completion: summary, request review, "تم".
9. Earnings: today / this month, balance, transactions list, **«سحب الرصيد»** (min 20 دينار, every 24h).
10. Withdraw: amount, bank/IBAN, confirm, status (requested/processing/paid).
11. Ratings received (from customers) + rate the customer (1–5, optional comment).
12. Profile, notifications, support.

**Edge cases:** account suspended/blocked, withdrawal below minimum / within 24h, no jobs nearby, going offline mid-shift.

---

## 8. APP 3 — CUSTOMER WEB (responsive, RTL)

Reuse customer flows; add a marketing surface. Provide **desktop (1440)** and **mobile web (390)** layouts.
1. Landing/marketing: hero (tagline + CTA), value props (30 min / fixed price / 30-day guarantee / 24-7 support), services + prices, how-it-works, trust/reviews, footer.
2. Login (phone + OTP).
3. Service catalog → service detail.
4. Booking flow (time, map location, payment) — desktop 2-column (form + map/summary).
5. Live tracking (map + status).
6. Account: bookings, receipts, guarantee, addresses, payment methods, support.

---

## 9. APP 4 — ADMIN PANEL (desktop web, can be LTR; data-dense)

Left side-nav + top bar. Screens:
1. **Dashboard**: KPI cards (today's revenue, bookings, active technicians, avg rating, open guarantees), charts (revenue trend, bookings by service), live activity feed.
2. **Technicians**: table (status filters pending/approved/rejected/suspended), detail drawer (profile, **documents viewer**, ratings), **approve / reject (with reason) / block**.
3. **Bookings**: **live map of active bookings** + table, filters by status (pending/searching/accepted/in_progress/completed/cancelled), detail (customer, technician, timeline, payment).
4. **Guarantee tickets**: queue with SLA timer (2h), **review photos/video**, approve/reject + notes, schedule free visit.
5. **Support tickets**: inbox, conversation view, reply, resolve, process refund.
6. **Customers**: table, detail, block/unblock, booking history.
7. **Financial reports**: revenue (daily/monthly), platform fees (20%), technician payouts, filters + date range, **export CSV**, charts.
8. **Broadcast notifications**: compose (title + body, Arabic), segment (all / customers / technicians), preview, send.
9. Admin auth (email + password), roles (super_admin / ops / finance / support).

Design dense but legible: sortable tables, status chips, filters, pagination, empty/loading states, confirmation dialogs for destructive actions.

---

## 10. Data, content & status reference (use exactly)

**Services & fixed prices:** Electricity كهرباء 50 · Plumbing سباكة 40 · AC Cleaning تكييف 30 · Painting دهان 70 · Furniture تركيب أثاث 35 — all in **دينار (JOD)**, fixed, shown upfront.

**Booking status → label (AR) → badge color:**
- pending → بانتظار الدفع → gray
- searching → جارٍ البحث عن فني → blue
- accepted → تم القبول → blue
- technician_arriving → الفني في الطريق → teal
- in_progress → الخدمة جارية → amber
- completed → مكتملة → green
- cancelled → ملغاة → red
- expired → منتهية → gray

**Payment methods:** Apple Pay, Google Pay, بطاقة (Visa/Mastercard). No cash. "دفع آمن 100%".
**OTP delivery:** "تم إرسال الرمز عبر واتساب" (SMS fallback).
**Trust signals to surface:** ratings (4.5+), "ضمان 30 يوم", "دعم 24/7", verified technician check, masked phone number for calls.
**Currency format:** "50 دينار" (Western numerals). **ETA:** "5 دقائق".
**Pre-auth hold:** "سيتم حجز المبلغ الآن ويُخصم بعد إتمام الخدمة." · **Refund:** "تم إصدار المبلغ المسترد." · **Promo:** "أدخل رمز الخصم" · **Verified review badge:** "تقييم موثّق".

---

## 11. Accessibility & quality bar
- WCAG 2.1 AA contrast on all text/controls.
- Touch targets ≥ 44×44pt.
- Full RTL correctness (layout mirrored, text right-aligned, directional icons flipped); numerals stay LTR.
- Support large/dynamic text; don't truncate Arabic.
- Clear focus/selected states; never rely on color alone for status (icon + label too).

---

## 12. Deliverable
- A **connected, navigable prototype** organized into pages: **0. Design System / Components**, **1. Customer Mobile**, **2. Technician Mobile**, **3. Customer Web**, **4. Admin**.
- **Light theme + Arabic/RTL first**; include dark-theme and key English/LTR variants of the main screens.
- Include all **states** (loading/empty/error/success) for hero screens (home, booking flow, tracking, guarantee, earnings, admin tables).
- Wire the main happy-path flows so they click through: onboarding → book → pay → track → complete → rate; technician: receive → accept → start → complete → withdraw.
- Consistent use of the design tokens and components defined above.

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

**Primary buttons:** اطلب الآن · تأكيد الحجز · ادفع الآن · بدء الخدمة · إنهاء الخدمة · إرسال · متابعة · تأكيد · إلغاء · إعادة المحاولة · سحب الرصيد · فتح تذكرة ضمان.

**Empty states:** لا توجد حجوزات بعد — اطلب أول خدمة الآن · لا توجد إشعارات · لا توجد طلبات قريبة حالياً (tech) · أضف عنوانك الأول.

**Errors / problems:**
- Network: "تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً."
- OTP wrong: "الرمز غير صحيح." · OTP expired: "انتهت صلاحية الرمز، اطلب رمزاً جديداً."
- Payment failed: "فشلت عملية الدفع. جرّب وسيلة دفع أخرى."
- No technicians: "لا يوجد فنيون متاحون الآن، حاول بعد قليل."
- Location off: "فعّل الموقع لتحديد عنوانك." · Generic: "حدث خطأ ما، حاول مرة أخرى."

**Toasts / confirmations:** تم تأكيد حجزك · تم إلغاء الحجز وإصدار المبلغ المسترد · شكراً لتقييمك · تم إرسال طلب السحب · تم الحفظ.

**Destructive confirms:** "هل أنت متأكد من إلغاء الحجز؟" · "تسجيل الخروج؟" · "حذف الحساب نهائياً؟ لا يمكن التراجع."

**Push notifications:**
- "تم قبول حجزك ✅ الفني في الطريق"
- "الفني على بُعد 5 دقائق 🚗"
- "تم إكمال الخدمة — قيّم تجربتك ⭐"
- "تحديث على طلب الضمان الخاص بك"
- Tech: "طلب جديد قريب منك — اقبل خلال 5 دقائق"

**Support:** "نحن هنا لمساعدتك 24/7" · "الرد خلال 5 دقائق".

---

## 15. Sample / seed content (use realistic Jordanian data — no placeholders)
- **Customer names:** أحمد العلي، سارة خالد، محمد الزعبي، رنا حدّاد، يوسف العمري.
- **Technician names + ratings:** خالد المومني ⭐4.9 (320 خدمة)، عمر الشريف ⭐4.7 (180)، سامي النسور ⭐4.8 (95).
- **Amman districts:** عبدون، الصويفية، خلدا، دير غبار، تلاع العلي، الجبيهة، مرج الحمام، الدوار السابع.
- **Sample addresses:** "خلدا، شارع وصفي التل، عمارة 12، ط2" · "الصويفية، دوار باريس، عمارة 5".
- **Phone:** +962 79 000 0000 (mask in calls as 079 0••• ••00).
- **Sample active booking:** كهرباء — 50 دينار — فوراً — خلدا — الفني خالد على بُعد 5 دقائق.
- **Sample earnings (tech):** اليوم 85 دينار · هذا الشهر 1,240 دينار · الرصيد 310 دينار.
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
