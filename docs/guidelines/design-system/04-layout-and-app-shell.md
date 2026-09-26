# 4. Layout and app shell

The shell has four docked regions around the canvas. Every region is a Web Component, and the shell config decides which fills each region.

```
+--------------------------------------------------------------------------+
| Top bar 44 px: project, breadcrumb with stratum swatches, mode tabs      |
+------------+-----------------------------------------------+-------------+
| Library    | Run control bar 40 px (always visible)        | Inspector   |
| and        +-----------------------------------------------+ Properties  |
| project    | |                                             | State       |
| tree       | |  Depth column         Canvas                | Methods     |
|            | |                                             | Metrics     |
| 280 px     | |                                             | Comments    |
|            +-----------------------------------------------+ Links       |
|            | Scrubber, then dock 240 px: Runs, Console,    | 320 px      |
|            | Logs, Trace, Tests, Problems                  |             |
+------------+-----------------------------------------------+-------------+
```

| Region | Default | Min / max | Collapsed |
| --- | --- | --- | --- |
| Top bar | 44 px high | fixed | never |
| Run control bar | 40 px high, across the top of the canvas | fixed | 32 px in Design mode; never hidden |
| Left panel | 280 px | 220 / 420 px | 44 px icon rail |
| Inspector | 320 px | 280 / 480 px | hidden |
| Dock | 240 px | 120 px / 60% of height | 32 px tab strip |

- Panels are resized by dragging their 1 px divider, which has an 8 px hit area. Sizes persist per project in sessionStorage.
- Mode tabs (Design, Simulate, Debug, Test, Docs, Plan) change panel contents but never the selection or the level.
- Text in panels is left-aligned. Numbers in tables and the inspector are right-aligned.

## Density

Standard density (28 px controls) is the default. Compact (24 px) suits large screens and experienced users. Touch (36 px) switches on automatically for coarse pointers.

## Responsive behaviour

| Width | Behaviour |
| --- | --- |
| 1440 px and up | All regions open |
| 1280–1439 px | Default layout |
| 1024–1279 px | Inspector becomes a drawer over the canvas |
| 768–1023 px | One side panel at a time; dock collapsed |
| Below 768 px | View and comment only: pan, zoom, drill, read, comment |

---
Part of the [Strata UI/UX Design System](README.md).
