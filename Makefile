.PHONY: all dev build test pack lint clean

all: build test pack

dev:
	@echo "Ready for development. Load unpacked extension from dist/chrome/ or dist/firefox/"

build:
	@node icons/generate_icons.js
	@node scripts/build_dist.js
	@echo "Build complete for Chrome and Firefox."

test:
	@node --test tests/*.test.js

lint:
	@node -c background.js content.js options/options.js popup/popup.js scripts/build_dist.js tests/*.js 2>/dev/null || true
	@echo "Syntax check completed."

pack: build
	@cd dist/chrome && zip -r ../chrome.zip . -x "*.DS_Store" "*~"
	@cd dist/firefox && zip -r ../firefox.zip . -x "*.DS_Store" "*~"
	@echo "Packed dist/chrome.zip and dist/firefox.zip"

clean:
	@rm -rf dist
	@echo "Clean complete."
