# Logs first-row visibility

## Intent
Make request metadata visible in the Logs table so a user can confirm proxy traffic.

## Goals and non-goals
- Keep the existing metadata-only privacy behavior and detail panel.
- Show rows in short desktop result lists; preserve virtualized scrolling for large lists.
- Do not display prompt or response bodies, or change filtering and pagination.

## Approaches
- **Selected: conditional sticky header.** Keep the short-results table header in normal flow; use a sticky header only when the table is a vertically scrollable, virtualized list. This fixes the overlap without changing ordinary page scrolling.
- **Not selected: always-scrollable card.** Put all result counts in a bounded vertical scroller and keep a sticky header. This changes normal scrolling behavior without helping short lists.

## Constraints and implementation
The current Logs page switches to virtualization above 500 rows. For short lists, the results viewport is not intended to scroll vertically, so its header should not have a sticky offset. Add focused regression coverage for short-list visibility while retaining the existing large-list virtualization behavior.
