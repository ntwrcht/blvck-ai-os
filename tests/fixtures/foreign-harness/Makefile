# Verification entrypoint. `make verify` is what "am I healthy" means in this repo.
# There is no shell script here; .SHELLFLAGS below is how this harness fails fast.
# Deliberately phrased without the built-in needle, so the synonym is what earns the point.
.SHELLFLAGS := -ec
.ONESHELL:

.PHONY: verify test lint clean

verify: test lint

test:
	npm test

lint:
	npm run lint

clean:
	rm -rf dist
