# Debugbar accessibility verification

The toolbar is covered by automated axe, keyboard, focus, and ARIA-role tests. Browser verification should also confirm:

- Open and close the toolbar using only Tab, Enter, and Space.
- Move among tabs with Left, Right, Home, and End; the selected panel must follow focus.
- Change the request and panel-height controls from the keyboard.
- Confirm focus enters the opened toolbar and returns to its toggle after closing.
- With a screen reader, confirm the toolbar landmark, request selector, tab list, selected tab, panel, loading status, and error alert are announced.
- At 200% zoom and 320 px width, confirm content remains reachable without page-level horizontal scrolling.
- In forced-colors and reduced-motion modes, confirm controls remain distinguishable and panel motion is removed.

Record the browser, screen reader, operating system, and date whenever completing a release review.

## Automated browser evidence

Last run: 2026-08-14

- [x] Keyboard operation for toggle, close, request selector, height control, and tab navigation.
- [x] Focus enters the panel and returns to the toggle.
- [x] Toolbar landmark, selector, tab list, selected tab, and panel relationships are exposed.
- [x] Computed toolbar text contrast is at least 4.5:1.
- [x] Reduced-motion mode removes the panel transition.
- [x] Forced-colors mode retains visible, enabled controls.
- [x] 200% zoom at an effective 320 CSS pixels has no page-level horizontal overflow.
- [x] Axe reports no serious or critical violations.

## Manual release evidence

- [ ] Screen reader and browser/version recorded.
- [ ] Landmark, request selector, tabs, loading status, unavailable status, and error alert announcements confirmed by listening.
- [ ] Forced-colors visual distinction manually confirmed.
- [ ] WCAG AA contrast review independently confirmed.
