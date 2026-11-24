# Fieldwork library · baseline

Capture complete.

Browser: Chromium 158.0.8127.18

## Coverage

| Profile | View | Arrival | Capture |
| --- | --- | --- | --- |
| wide | inbox | Direct entry | [Clean PNG](wide/inbox.png) |
| wide | archive | Direct entry | [Clean PNG](wide/archive.png) |
| wide | record | Direct entry | [Clean PNG](wide/record.png) |
| wide | settings | Direct entry | [Clean PNG](wide/settings.png) |
| wide | returned-inbox | Link from archive | [Clean PNG](wide/returned-inbox.png) |
| compact | inbox | Direct entry | [Clean PNG](compact/inbox.png) |
| compact | archive | Direct entry | [Clean PNG](compact/archive.png) |
| compact | record | Direct entry | [Clean PNG](compact/record.png) |
| compact | settings | Direct entry | [Clean PNG](compact/settings.png) |
| compact | returned-inbox | Link from archive | [Clean PNG](compact/returned-inbox.png) |

## View comparisons

Distances and signed changes are in CSS pixels. Positive means right or down for screen positions. Relative gaps follow the order of the two edges in the rule.

| Profile | From → to | Check | From | To | Change | Intended | Tolerance | Status | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| wide | inbox → archive | Title inset within pane | 30 | 33 | 3 | 0 | 0.25 | drift | Direct entry / Direct entry |
| wide | inbox → archive | Title start | 222 | 225 | 3 | 0 | 0.25 | drift | Direct entry / Direct entry |
| wide | inbox → archive | First label inset within row | 15 | 15 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | inbox → archive | Content pane edge | 192 | 192 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | inbox → archive | Title to toolbar gap | 14 | 14 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | inbox → archive | Workspace link trailing edge | 1014 | 1014 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | inbox → record | Title to toolbar gap | 14 | 12 | -2 | 0 | 0.25 | drift | Direct entry / Direct entry |
| wide | inbox → record | Title top | 84 | 116 | 32 | 32 | 0.25 | expected | Direct entry / Direct entry / The record view adds a 32 CSS px breadcrumb above the title. |
| wide | inbox → record | Title inset within pane | 30 | 30 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | inbox → record | Content pane edge | 192 | 192 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | inbox → record | Workspace link trailing edge | 1014 | 1014 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | inbox → settings | Content pane edge | 192 | 196 | 4 | 0 | 0.25 | drift | Direct entry / Direct entry |
| wide | inbox → settings | Title start | 222 | 226 | 4 | 0 | 0.25 | drift | Direct entry / Direct entry |
| wide | inbox → settings | Title inset within pane | 30 | 30 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | inbox → settings | Workspace link trailing edge | 1014 | 1014 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | archive → inbox | Title inset within pane | 33 | 30 | -3 | 0 | 0.25 | drift | Direct entry / Direct entry |
| wide | archive → inbox | First label inset within row | 15 | 15 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| wide | inbox → returned-inbox | Title inset within pane | 30 | 32 | 2 | 0 | 0.25 | drift | Direct entry / Link from archive |
| wide | inbox → returned-inbox | Workspace link trailing edge | 1014 | 1014 | 0 | 0 | 0.25 | aligned | Direct entry / Link from archive |
| wide | archive → returned-inbox | Title inset within pane | 33 | 32 | -1 | 0 | 0.25 | drift | Direct entry / Link from archive |
| compact | inbox → archive | Title inset within pane | 16 | 19 | 3 | 0 | 0.25 | drift | Direct entry / Direct entry |
| compact | inbox → archive | Title start | 16 | 19 | 3 | 0 | 0.25 | drift | Direct entry / Direct entry |
| compact | inbox → archive | First label inset within row | 15 | 15.5 | 0.5 | 0 | 0.25 | drift | Direct entry / Direct entry |
| compact | inbox → archive | Content pane edge | 0 | 0 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| compact | inbox → archive | Title to toolbar gap | 14 | 14 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| compact | inbox → archive | Workspace link trailing edge | 374 | 374 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| compact | inbox → record | Title to toolbar gap | 14 | 12 | -2 | 0 | 0.25 | drift | Direct entry / Direct entry |
| compact | inbox → record | Title top | 119 | 151 | 32 | 32 | 0.25 | expected | Direct entry / Direct entry / The record view adds a 32 CSS px breadcrumb above the title. |
| compact | inbox → record | Title inset within pane | 16 | 16 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| compact | inbox → record | Content pane edge | 0 | 0 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| compact | inbox → record | Workspace link trailing edge | 374 | 374 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| compact | inbox → settings | Content pane edge | 0 | 0 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| compact | inbox → settings | Title start | 16 | 16 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| compact | inbox → settings | Title inset within pane | 16 | 16 | 0 | 0 | 0.25 | aligned | Direct entry / Direct entry |
| compact | inbox → settings | Workspace link trailing edge | 374 | 372 | -2 | 0 | 0.25 | drift | Direct entry / Direct entry |
| compact | archive → inbox | Title inset within pane | 19 | 16 | -3 | 0 | 0.25 | drift | Direct entry / Direct entry |
| compact | archive → inbox | First label inset within row | 15.5 | 15 | -0.5 | 0 | 0.25 | drift | Direct entry / Direct entry |
| compact | inbox → returned-inbox | Title inset within pane | 16 | 18 | 2 | 0 | 0.25 | drift | Direct entry / Link from archive |
| compact | inbox → returned-inbox | Workspace link trailing edge | 374 | 374 | 0 | 0 | 0.25 | aligned | Direct entry / Link from archive |
| compact | archive → returned-inbox | Title inset within pane | 19 | 18 | -1 | 0 | 0.25 | drift | Direct entry / Link from archive |

[Open the visual comparison](index.html) · [Measurements and capture settings](report.json)
