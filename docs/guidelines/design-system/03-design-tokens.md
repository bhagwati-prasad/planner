# 3. Design tokens

Tokens come in three tiers. Components use only semantic and component tokens, never primitives.

| Tier | Example | Used by |
| --- | --- | --- |
| Primitive | `--st-lapis-600: #3346D3` | Token files only |
| Semantic | `--st-color-accent: var(--st-lapis-600)` | All CSS, canvas and 3D code |
| Component | `--st-node-radius: var(--st-radius-md)` | One component family |

## Neutral scale: Basalt

| Step | Hex | Step | Hex |
| --- | --- | --- | --- |
| 0 | `#FFFFFF` | 500 | `#626C7C` |
| 25 | `#F7F8FA` | 600 | `#4F5866` |
| 50 | `#F0F2F5` | 700 | `#3B424D` |
| 100 | `#E4E7EC` | 800 | `#2A3038` |
| 200 | `#CFD4DC` | 850 | `#22272E` |
| 300 | `#B0B8C4` | 900 | `#1B1F25` |
| 400 | `#8A94A3` | 950 | `#13161A` |

## Accent scale: Lapis

| Step | Hex | Step | Hex |
| --- | --- | --- | --- |
| 50 | `#EEF0FE` | 500 | `#4A5ADF` |
| 100 | `#DDE1FC` | 600 | `#3346D3` |
| 200 | `#BCC4F9` | 700 | `#2837A8` |
| 300 | `#95A1F4` | 800 | `#1F2B80` |
| 400 | `#6E7CE9` | 900 | `#1E2556` |

## Semantic colour tokens

Every pairing meets WCAG 2.2 AA: 4.5:1 for text, and 3:1 for icons, focus rings and control outlines. Subtle and default borders are dividers only; any outline that identifies a control or node uses the control border, which reaches 3:1 against both surface and canvas.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--st-color-bg-canvas` | `#F3F5F7` | `#13161A` | Canvas background |
| `--st-color-bg-surface` | `#FFFFFF` | `#1B1F25` | Panels, nodes |
| `--st-color-bg-raised` | `#FFFFFF` | `#22272E` | Menus, popovers, dialogs |
| `--st-color-bg-subtle` | `#F0F2F5` | `#2A3038` | Hovered rows, inset areas |
| `--st-color-border-subtle` | `#E4E7EC` | `#2A3038` | Panel dividers, group frames |
| `--st-color-border-default` | `#CFD4DC` | `#3B424D` | Inputs, nodes |
| `--st-color-border-control` | `#7F8999` | `#626C7C` | Inputs, checkboxes, switches, canvas nodes |
| `--st-color-border-strong` | `#4F5866` | `#8A94A3` | Hover, emphasis |
| `--st-color-text-primary` | `#1B1F25` | `#E6E9EE` | Body text, titles |
| `--st-color-text-secondary` | `#4F5866` | `#AEB6C2` | Labels, subtitles |
| `--st-color-text-tertiary` | `#626C7C` | `#8A94A3` | Hints, units, timestamps |
| `--st-color-accent` | `#3346D3` | `#95A1F4` | Selection, focus, primary buttons |
| `--st-color-accent-hover` | `#2837A8` | `#BCC4F9` | Hovered primary controls |
| `--st-color-accent-subtle` | `#EEF0FE` | `#1E2556` | Selected rows, marquee fill |
| `--st-color-text-on-accent` | `#FFFFFF` | `#13161A` | Text on accent fills |
| `--st-color-focus` | `#3346D3` | `#95A1F4` | Focus rings |
| `--st-color-guide` | `#7A45C2` | `#B38BEB` | Smart guides and spacing labels |

## Status colours

Status colour always travels with an icon and words. Colour alone never carries meaning.

| Status | Text and icon (light / dark) | Fill | Background (light / dark) | Icon |
| --- | --- | --- | --- | --- |
| Success (Malachite) | `#197A50` / `#5CC792` | `#2E9E6B` | `#E6F4EC` / `#14301F` | Check in circle |
| Warning (Ochre) | `#8F5B0A` / `#E7B458` | `#D99A2B` | `#FBF1DC` / `#33270F` | Triangle |
| Danger (Garnet) | `#B42335` / `#F0808C` | `#D0394B` | `#FBE7E9` / `#3A1519` | Octagon |
| Info (Azurite) | `#0B6E99` / `#6CC0E8` | `#1C8CC0` | `#E3F2F9` / `#0F2A38` | Circle with "i" |

## Stratum bands: the depth palette

Stratum bands mark nesting depth. They appear only as thin bands, layered node edges, the depth column and 3D planes, and never on text or as status.

| Depth | Name | Light | Dark |
| --- | --- | --- | --- |
| 0 (root) | Basalt | `#8A94A3` | `#8A94A3` |
| 1 | Sandstone | `#C39A6B` | `#D8B48A` |
| 2 | Shale | `#7B8BA3` | `#9AA9C0` |
| 3 | Clay | `#B26E55` | `#D08E75` |
| 4 | Lichen | `#8A9C66` | `#A9BA84` |
| 5 | Tuff | `#B0829A` | `#CBA0B6` |
| 6 | Chert | `#5F9794` | `#82B6B3` |
| 7+ | Repeats from 1 | Adds a diagonal hatch | Adds a diagonal hatch |

## Data colours

- **Heat ramp** for utilisation, and for latency against an SLO. Below 50% there is no tint. Then 50–70% `#F4DE9C`, 70–85% `#EDB85A`, 85–95% `#DD7F37`, and 95% or more `#B8322E` plus the danger icon. The ramp darkens as it heats, so it reads in greyscale and for colour-blind users. In dark theme it fills at 40% opacity with a solid bar.
- **Categorical series** for charts and author identities, based on the Okabe–Ito palette: `#3346D3`, `#E69F00`, `#009E73`, `#CC79A7`, `#56B4E9`, `#D55E00`, with `#8A94A3` for "Other". Charts use at most six series.
- **Paper** for sticky notes: `#FFF4CF` with Basalt 900 text in light theme; `#3A3320` with `#F2E7C4` text in dark theme.

## Typography tokens

| Token | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| `--st-type-caption` | 11 / 14 px | 500 | Badges, axis ticks |
| `--st-type-small` | 12 / 16 px | 400 | Secondary text, dense tables |
| `--st-type-label` | 12 / 16 px | 500 | Form and property labels |
| `--st-type-body` | 13 / 20 px | 400 | Default interface text |
| `--st-type-body-strong` | 13 / 20 px | 600 | Node titles, emphasis |
| `--st-type-title-sm` | 14 / 20 px | 600 | Panel and group titles |
| `--st-type-title` | 16 / 24 px | 600 | Dialog titles, empty states |
| `--st-type-doc-body` | 16 / 26 px | 400 | Docs editor body, 72 characters max |
| `--st-type-doc-h3` | 18 / 26 px | 600 | Docs level-3 headings |
| `--st-type-doc-h2` | 22 / 30 px | 600 | Docs level-2 headings, -0.01 em tracking |
| `--st-type-doc-h1` | 28 / 36 px | 600 | Docs title, -0.01 em tracking |
| `--st-type-display` | 36 / 44 px | 500 | Onboarding only, -0.015 em tracking |

- Font stacks: `--st-font-sans: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` and `--st-font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`.
- Bundled weights: Sans 400, 500 and 600; Mono 400 and 500.
- Numbers that line up (tables, inspector, metrics, timelines) use `font-variant-numeric: tabular-nums`. Numbers in prose stay proportional.
- Labels are sentence case. Tracked-out all-caps labels are not used anywhere.
- Mono is for code, expressions, ids, keys such as `PAY-42`, and paths. It is not used for metric values or data labels.

## Space, size and shape

| Token family | Values |
| --- | --- |
| Space (4 px base) | 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64 px as `--st-space-0` to `--st-space-12` |
| Control height | 24 px compact, 28 px standard (default), 36 px touch |
| Stroke | 1 px hairline, 1.5 px connectors, 2 px selection and focus |

Radius follows hierarchy, so nested elements never share one radius:

| Token | Value | Used for |
| --- | --- | --- |
| `--st-radius-none` | 0 | Docked panels, tables, dock |
| `--st-radius-sm` | 4 px | Buttons, inputs, chips |
| `--st-radius-md` | 6 px | Canvas nodes, frames, ticket cards |
| `--st-radius-lg` | 10 px | Menus, popovers, command palette |
| `--st-radius-xl` | 14 px | Dialogs |
| `--st-radius-full` | 999 px | Ports, pins, avatars, count badges |

## Elevation

Docked panels have no shadow; hairline borders separate them. Only floating layers cast shadows.

| Token | Light | Dark |
| --- | --- | --- |
| `--st-elevation-1` (menus, popovers) | `0 4px 12px rgba(19,22,26,.12)` + 1 px subtle border | `0 4px 12px rgba(0,0,0,.5)` + 1 px default border |
| `--st-elevation-2` (dialogs, palette) | `0 12px 32px rgba(19,22,26,.18)` | `0 12px 32px rgba(0,0,0,.6)` + 1 px default border |
| `--st-elevation-drag` (dragged nodes) | `0 8px 20px rgba(19,22,26,.16)` | `0 8px 20px rgba(0,0,0,.55)` |

## Motion

Motion answers a person's action and shows what changed. Nothing moves on its own except live simulation feedback.

| Token | Value | Use |
| --- | --- | --- |
| `--st-duration-fast` | 90 ms | Hover, press |
| `--st-duration-base` | 160 ms | Menus, toggles, tabs |
| `--st-duration-slow` | 240 ms | Panels opening or collapsing |
| `--st-duration-depth` | 420 ms | Drill-down and roll-up transitions |
| `--st-ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | Entering and moving |
| `--st-ease-exit` | `cubic-bezier(.4, 0, 1, 1)` | Leaving |
| `--st-ease-depth` | `cubic-bezier(.3, 0, .1, 1)` | Depth transitions |

With `prefers-reduced-motion`, depth transitions become a 120 ms cross-fade, animated request dots become static flow arrows with counts, and nothing pulses.

## Layers

| Layer | z-index |
| --- | --- |
| Canvas, canvas overlays | 0, 10 |
| Docked panels, sticky headers | 100, 150 |
| Dropdowns, popovers | 200, 300 |
| Dialogs, toasts | 400, 500 |
| Tooltips, drag ghost | 600, 700 |

---
Part of the [Strata UI/UX Design System](README.md).
