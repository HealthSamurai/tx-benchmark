# tx-benchmark site

Static site built with [Astro](https://astro.build) + Svelte. Publishes benchmark results as a browsable report.

## Development

```bash
bun install        # first time only
bun run dev        # dev server → http://localhost:4100
bun run build      # production build → dist/
bun run preview    # preview the production build locally
```

## Adding a run

1. **Run the benchmark** (from repo root):
   ```bash
   bun scripts/run.ts <server> <base-url> <run-id>
   ```

2. **Export to the site** (from repo root):
   ```bash
   bun scripts/export-run.ts --run <run-id> --date YYYY-MM-DD
   ```
   Writes `src/data/<run-id>.json` and updates `src/data/runs.json`.

3. **(Optional) Add an errors CSV** — export from Grafana and place at:
   ```
   src/data/<run-id>.errors.csv
   ```
   The Breakdown page will show a Logs widget with a download link automatically.

4. **Commit and push**:
   ```bash
   git add src/data/<run-id>.json src/data/runs.json
   git add src/data/<run-id>.errors.csv   # if present
   git commit -m "Add run <run-id>"
   git push
   ```
   GitHub Actions builds and deploys to GitHub Pages on push to `master`.

## Data files

`src/data/*.json` are gitignored by default so local dev runs don't pollute the repo. Add them explicitly with `git add -f` or list them in `.gitignore` exceptions when publishing official results.

## Structure

```
src/
  content/tests/   markdown descriptions for each test (FS01, LK01, …)
  data/            per-run JSON + optional errors CSV
  layouts/         Run, Doc, Base layouts
  components/      Widget, Matrix, TestBadge, MD, …
  pages/
    index.astro          home / leaderboard
    results/[run]/       per-run pages (overview, details, tests, servers)
    tests.mdx            test catalogue
    scoring.mdx          scoring methodology
    servers.mdx          server descriptions
```
