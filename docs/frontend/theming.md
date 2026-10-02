# Custom Theming & Accessibility

CodeLens supports three built-in themes with smooth transitions and keyboard accessibility built-in.

## Themes

| Theme              | Class on `<html>`     | Description                         |
| ------------------ | --------------------- | ----------------------------------- |
| **Dark** (default) | _(none)_              | Deep graphite-indigo dark theme     |
| **Light**          | `theme-light`         | Clean off-white light theme         |
| **High Contrast**  | `theme-high-contrast` | WCAG AA-compliant, pure black/white |

## Architecture

The theming engine is entirely CSS-variable-based. Tailwind tokens like `bg-surface`, `text-muted`, and `border-border` all read from CSS custom properties defined in `:root`. Theme CSS files simply override those same variables for a specific `<html>` class — no component code changes are needed.

```
client/src/app/index.css           ← :root default (dark) + global rules
client/src/app/themes/light.css    ← html.theme-light overrides
client/src/app/themes/high-contrast.css ← html.theme-high-contrast overrides
```

## ThemeContext

`ThemeContext.jsx` provides:

```jsx
const { theme, setTheme } = useTheme();

// theme: { id, label, htmlClass, icon }
// setTheme('light') | setTheme('dark') | setTheme('high-contrast')
```

The selected theme is persisted in `localStorage` under the key `codelens:theme` and automatically restored on the next page load.

## ThemeSwitcher UI

A `ThemeSwitcher` dropdown is embedded in `RepositoryHeader.jsx`. It shows the active theme icon and label and allows switching via a click menu. It is fully keyboard accessible (`aria-label`, `role="menu"`, `role="menuitem"`).

## Accessibility

- All interactive elements receive a visible `outline` on `:focus-visible` (keyboard focus only).
- Mouse-click focus (`focus:not(:focus-visible)`) is suppressed to avoid distracting rings.
- High Contrast theme applies a stronger 3px outline for maximum visibility.
- All icon-only buttons carry an `aria-label` for screen reader support.
- Theme transitions (background, border, text color) are `0.15s–0.2s ease` for a smooth, non-jarring switch. Transforms and layout properties are excluded from the transition to avoid animation jank.
