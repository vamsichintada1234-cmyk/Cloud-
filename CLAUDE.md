# Video editing repo

Two toolchains live here:

- **HyperFrames** (default for new videos): projects in `videos/<name>/`, layout and commands in
  `videos/README.md`. Start every video request with the `/hyperframes` skill.
- **Remotion** (legacy `Hibro01` edit): `src/`, `remotion.config.ts`, media in root `raw/` and `assets/`.

## HyperFrames conventions

- Create projects with `scripts/new-video.sh <name> [--resolution portrait|square|...]`, never by hand.
- User inputs: `assets/footage/` (source footage), `reference/` (reference videos, style frames,
  scripts, brand guides; study only, never place in the edit), `assets/images/` and `assets/broll/`
  (stills, screenshots, B-roll), `assets/{music,sfx,voice,brand}/` (other assets).
- Skills are vendored in `.claude/skills` and pinned with the CLI version in
  `videos/.hyperframes-version`. `HYPERFRAMES_SKIP_SKILLS=1` makes `hyperframes skills update`
  a no-op, so the router's "install the workflow" step succeeds without touching the snapshot.
  Do not install skills globally or run `npx skills add` unless asked to upgrade.
- Write renders to `videos/<name>/renders/`. Video/audio files are git-ignored.
