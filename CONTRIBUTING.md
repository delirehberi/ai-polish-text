# Contributing to LLM Text Polisher

Thank you for your interest in improving **LLM Text Polisher**! We welcome contributions from the open-source community.

---

## Getting Started

1. **Fork and Clone:**
   ```bash
   git clone https://github.com/delirehberi/ai-polish-text.git
   cd ai-polish-text
   ```

2. **Load Extension in Browser for Development:**
   - Run `make build` to build unpacked distributions in `dist/chrome` and `dist/firefox`.
   - In Chrome/Brave/Edge: Go to `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select `dist/chrome`.
   - In Firefox: Go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select `dist/firefox/manifest.json`.

---

## Testing & Quality Assurance

Before submitting a Pull Request, make sure all tests and syntax checks pass:

```bash
# Run unit tests and open source readiness checks
make test

# Verify syntax across all JavaScript files
make lint

# Package extension zip archives
make pack
```

---

## Code Guidelines

- **No Third-Party Bloat:** The extension is lightweight and built with vanilla JavaScript, native Web APIs, and isolated Shadow DOM. Keep external runtime dependencies to zero.
- **Cross-Browser Manifest V3:** Ensure changes remain fully functional on both Chrome and Firefox.
- **Security & Privacy First:** Never transmit user data to any intermediary server; all API calls must go directly from the browser to the user-configured LLM endpoint.

---

## Submitting a Pull Request

1. Create a feature branch: `git checkout -b feature/my-enhancement`.
2. Commit your changes with clear, descriptive commit messages.
3. Push to your fork and open a Pull Request against the `main` branch.
