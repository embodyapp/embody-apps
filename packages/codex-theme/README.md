# codexTheme

Reusable, app-owned styling plugin for Embody GenUI's standard web renderer.
Codex-inspired neutral colors, system typography, quiet rounded cards, responsive
columns, visible keyboard focus and light/dark mode. No remote fonts, scripts or
network requests. This is an independent visual theme, not an official OpenAI theme.

```ts
import { codexTheme } from '@embody-apps/codex-theme';

defineView({
  // ...props, version, callableTargets and fallback...
  resource: codexTheme.apply({ text: trustedBuiltHtml }),
});
```

Apply once to trusted, static app HTML before registering the view. The returned
resource retains its metadata; GenUI then hashes the themed resource normally.
The view's CSP must permit inline styles, as the standard renderer already requires.
This package styles the existing renderer; it adds no business plugin, actions or
permissions. It bridges the current candidate's lack of a native theme option and
does not modify the installed Embody packages. Visuals follow the host-inherited
color scheme, falling back to the system preference. Text/terminal fallbacks keep
their own rendering. Kanban's business data and actions remain authoritative.
