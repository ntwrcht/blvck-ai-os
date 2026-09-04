# Fixture: a filled PM vault

A vault with every interview answer given, used by `init.sh` to prove the round trip: a fresh
scaffold must exit 1 (unfinished), and this must exit 0 at 100/100.

`ABOUT-ME/current-focus.md` carries a placeholder date that `init.sh` stamps with today before
validating. The freshness check is genuinely time-dependent — a hardcoded date here would pass
today and fail CI in a month, which would be the test rotting rather than the code.
