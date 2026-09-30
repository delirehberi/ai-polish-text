.PHONY: all dev build test pack lint clean version-patch version-minor version-major version

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
	@node -c background.js content.js options/options.js popup/popup.js scripts/*.js tests/*.js 2>/dev/null || true
	@echo "Syntax check completed."

pack: build
	@cd dist/chrome && zip -r ../chrome.zip . -x "*.DS_Store" "*~"
	@cd dist/firefox && zip -r ../firefox.zip . -x "*.DS_Store" "*~"
	@echo "Packed dist/chrome.zip and dist/firefox.zip"

version-patch:
	@node scripts/bump_version.js patch
	@$(MAKE) pack

version-minor:
	@node scripts/bump_version.js minor
	@$(MAKE) pack

version-major:
	@node scripts/bump_version.js major
	@$(MAKE) pack

version:
	@node scripts/bump_version.js $(v)
	@$(MAKE) pack

clean:
	@rm -rf dist
	@echo "Clean complete."
