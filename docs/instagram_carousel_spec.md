# sora-no-koe IG Carousel Template (1080x1350)

## Overview
This template renders a 4-5 slide Instagram carousel in a unified “quiet observation log” style.
Slides 1, 3, and 4 are data-driven. Slide 2 uses the existing `sora_wheel` chart. Slide 5 is optional.

Files:
- `src/integrations/media/ig_carousel.js`
- `scripts/preview/ig_carousel_preview.js`

## Design Tokens
Colors:
- Background: `#0B0E1A` to `#14162B` gradient
- Main text: `#FFFFFF`
- Sub text: `#B9BDD9`
- Dim text: `#8D92B5`
- Line: `#2A2D4A`
- Accents: `#A9C6FF`, `#D7C8A5`

Nebula palettes (seeded 2-color selection per day):
- Fire: `#FF7A4F`, `#FFB36A`, `#FFD38C`
- Water: `#567CFF`, `#7AA8FF`, `#9B8CFF`
- Air: `#B5D0FF`, `#E4F1FF`, `#C7E8FF`
- Earth: `#BFA86A`, `#D6C38A`, `#7E9C6A`

Fonts:
- Title: `ZenKakuGothicNew-Regular.ttf` (`SoraTitle`)
- Title Bold: `ZenKakuGothicNew-Bold.ttf` (`SoraTitleBold`)
- Body: `ShipporiMincho-Regular.ttf` (`SoraBody`)
- Body Bold: `ShipporiMincho-Bold.ttf` (`SoraBodyBold`)
- Soft: `KleeOne-Regular.ttf` (`SoraSoft`)
- Glyphs: `NotoSansSymbols2-Regular.ttf` (`SoraGlyph`), fallback `Symbola_hint.ttf`

Canvas:
- 1080 x 1350 (4:5)

Margins:
- Left/Right baseline margin: 96px
- Bottom labels baseline: y = 1230px (slide2 label stack uses 1200/1234)

## Slide Layouts
### Slide 1 — 今日のソラ (hook)
Data fields:
- `dateLabel` (YYYY.MM.DD)
- `brand`
- `tagline`
- `sunLine` (example: `☉ 太陽｜魚座`)
- `moonLine` (example: `☽ 月｜乙女座`)
- `observation`
- `swipeLabel`

Text limits:
- `brand`: 6 chars (1 line)
- `tagline`: 12 chars (1 line)
- `sunLine` / `moonLine`: 12-16 chars (1 line)
- `observation`: 20 chars per line, max 2 lines
- `swipeLabel`: 8 chars

Wrap rules:
- `observation` auto-wraps by character count. If over 2 lines, it truncates with `…`.

Observation auto rules:
- Priority: sign focus → element balance → house focus
- Sign focus: any sign with >=2 bodies
  - Two signs: `A・B付近に天体が多い配置`
  - One sign: `A付近に天体が多い配置`
- Element balance:
  - Two elements (>=3 each): `水と火のあいだに重なりが見える配置`
  - Dominant element: `水の元素が強い配置`
- House focus: `第Nハウス付近に天体が多い配置`

### Slide 2 — ソラ図 / sky chart
Data fields:
- `story` (required)
- `dateLabel`
- `footerLabel` (default: `sky chart`)
- `subLabel` (default: `今日の配置`)

Rules:
- The chart is centered (860px square) with minimal labels.
- Aspect lines are limited to 10 max (uses `public.sky_top` if available).
- A translucent “glass” panel sits behind the wheel (opacity ~0.7) to blend with the space background.

Background variation rules:
- Nebula spread pattern is seeded (center / left-top / diagonal band).
- Micro stars include ~10–20% warm/cool tint; main stars stay white.
- Aspect light geometry opacity is slightly boosted for visibility.
- Slide1 adds a seeded daily color glow (primary/secondary) layered after deep space and before nebula.
  - Patterns: A leftTop→rightBottom, B rightTop→center, C leftBottom→rightTop
  - Radius: 25–35% (seeded)
  - Opacity: primary 0.22 / secondary 0.12
- Slide3 adds subtle glyph glows for the two resonant bodies.

### Slide 3 — 今日の共鳴
Data fields:
- `dateLabel`
- `header`
- `lineA` (example: `☽ 月（乙女座）`)
- `lineB` (example: `⚸ リリス（射手座）`)
- `aspectLine` (example: `セクスタイル 60°　orb 0.30°`)
- `structure`

Text limits:
- `lineA` / `lineB`: 18 chars (1 line)
- `aspectLine`: 24 chars (1 line)
- `structure`: no auto wrap or truncation (manual line breaks only)

Wrap rules:
- `structure` auto-wraps by character count (20 chars/line) without truncation.
- Manual line breaks (`\n`) are respected and wrapped per line.

AI integration (optional):
- If `story.outputs.ig.carousel.slide3_text` (or `story.outputs.ig.resonance_text`) exists, use it as `structure`.
- The IG resonance prompt lives in `src/content/prompts/sns/instagram/ig.js` as `SORA_AI_USER_GUIDE_IG_RESONANCE`.
  - 4文固定 / 2段落固定（1段落目2文＋2段落目2文）
  - 120〜140字目安（最大150字）

Observation prompt (optional):
- The IG observation prompt lives in `src/content/prompts/sns/instagram/ig.js` as `SORA_AI_USER_GUIDE_IG_OBSERVATION`.
- 1文のみ / 18〜28文字目安（最大32文字） / 句点・改行なし / 「〜配置」または体言止めで閉じる

Storage design:
- Common data: `story.public`
- IG-specific generation: `story.outputs.ig`
  - `story.outputs.ig.caption`
  - `story.outputs.ig.resonance_text`
  - `story.outputs.ig.carousel.slide3_text`

### Slide 4 — つきじ
Data fields:
- `dateLabel`
- `header`
- `lineA`
- `lineB`
- `structureLabel` (example: `構造：変容 × 癒し`)
- `start`, `peak`, `end`

Text limits:
- `lineA` / `lineB`: 18 chars (1 line)
- `structureLabel`: 22 chars per line, max 2 lines
- `start` / `peak` / `end`: `YYYY.MM.DD`

Wrap rules:
- `structureLabel` auto-wraps by character count. If over 2 lines, it truncates with `…`.

### Slide 5 — CTA (optional)
Data fields:
- `header`
- `cta`
- `sub`
- `brand`

Text limits:
- `header`: 12 chars per line, max 2 lines
- `cta`: 18 chars per line, max 2 lines
- `sub`: 20 chars per line, max 2 lines

Wrap rules:
- All CTA text auto-wraps by character count. If over 2 lines, it truncates with `…`.
- Manual line breaks are supported using `\n` inside `header`, `cta`, or `sub`.

## Preview
Generate sample slides:

```bash
node scripts/preview/ig_carousel_preview.js --date 2026-03-03 --story tmp/stories/story.json
```

Output:
- `tmp/ig/carousel/<date>/slide-1.png`
- `tmp/ig/carousel/<date>/slide-2.png`
- `tmp/ig/carousel/<date>/slide-3.png`
- `tmp/ig/carousel/<date>/slide-4.png`
- `tmp/ig/carousel/<date>/slide-5.png`

## Procedural Space Background (Daily Variant)
The carousel background is generated per-day from story data. The same date + data yields the same universe.

### Layer Structure
1. **deep space**: base navy + subtle center glow
2. **nebula**: FBM-style noise (fractal turbulence)
3. **stars**: 3-tier star field (micro / mid / main)
4. **light geometry**: strongest aspect glow/lines

### Seed Design
Seed is derived from:
- `date_local`
- strongest aspect (`sky_top[0]` a/b/type/deg)
- dominant element(s)
- dominant modality
- `house_focus.top[0]`
- `kinjitsu_short[0]` (if any)
- slide variant id (`slide1`..`slide5`)

### Inputs
From `story.public` / `story.meta`:
- `sky_strata.top_element` / `element_count`
- `sky_strata.top_modality`
- `sky_top[0]` (strongest aspect + orb)
- `house_focus.top[0]`
- `kinjitsu_long[0]` (for deep layer)
- `meta.as_of` (for retrograde count)

### Mapping Rules (current implementation)
- **Deep Space**
  - Base navy picked from `#050816 / #0A1030 / #10193D`
  - Soft center glow (8%–14%) to create depth
- **Nebula (FBM)**
  - `feTurbulence` (3–5 octaves) + blur
  - Primary opacity 10%–18%, secondary 4%–10%
  - Element palette chooses color
  - Modality controls direction (cardinal = directional, fixed = centered, mutable = diffuse)
- **Stars**
  - Micro: 220–420 (size 0.6–1.4px, opacity 0.15–0.45)
  - Mid: 45–90 (size 1.5–2.8px, opacity 0.35–0.75)
  - Main: 3–4 (size 3–6px, opacity 0.55–0.95, soft glow)
  - Colors: white 65%, blue-white 20%, gold 10%, purple 5%
  - House focus biases star cluster position (1–3: right/top, 4–6: bottom, 7–9: left, 10–12: upper-left)
- **Light Geometry**
  - Aspect type controls geometry (conj / opp / square / trine / sextile / others)
  - Orb controls intensity (smaller orb = stronger glow)
- **Retrogrades**
  - Faint star echoes for main stars
- **Long Theme (つきじ)**
  - Adds a deep, dark band using long-term aspect sign elements
- **Readability Safe Zone**
  - Center area is subtly darkened to preserve text contrast

### Slide Variants
- **Slide 1**: quietest, low nebula, low aspect glow
- **Slide 2**: chart-safe, minimal background
- **Slide 3**: strongest aspect glow emphasized
- **Slide 4**: deep theme layer emphasized
- **Slide 5**: calm with slight top glow for CTA readability
