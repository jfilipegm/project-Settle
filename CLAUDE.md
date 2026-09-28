# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository.

## Semi-autonomous workflow gates

Work follows the state machine in `docs/ai-workflow/MILESTONE_WORKFLOW.md`.
Claude works autonomously between gates but must stop and wait at every hard
gate that document names -- see its "Hard gates summary" for the current
count and list, which changes as the workflow evolves; do not hardcode a
count here.

Use the commands in `.claude/commands/` to drive each state. Do not skip a
gate because the diff looks small.

## Workflow documents

- Milestone state machine: `docs/ai-workflow/MILESTONE_WORKFLOW.md`
- Two-stage plan review: `docs/ai-workflow/PLAN_REVIEW_WORKFLOW.md`
- Bundle mechanics and feedback format: `docs/ai-workflow/REVIEW_PROTOCOL.md`
- Phase/command reference: `docs/ai-workflow/WORKFLOW_V2_1_OPERATOR_REFERENCE.md`
- Current work-item state: `docs/ai-workflow/WORKFLOW_STATE.json` (ground
  truth -- never inferred from plan text)
- Active work item narrative: `docs/ACTIVE_MILESTONE.md`

## Git restrictions

- Commits are normally prohibited. Only commit when a workflow command
  explicitly authorizes it after verification gates pass.
- Never push, merge, rebase, force-push, or open a pull request.
- Don't touch unrelated working-tree changes.

<!--
Sections above this marker are managed by workflow-manager and are replaced
on update. Add repository-specific guidance below it; it is never touched.
-->

<!-- workflow-manager:end -->

## Git and GitHub workflow (repository-specific)

This section overrides the managed "Git restrictions" above wherever they
conflict. The remote is `origin`, https://github.com/jfilipegm/project-Settle,
and `master` is protected.

### One branch and one PR per milestone

1. **Start from an up-to-date `master`.** Before planning milestone X,
   run `git switch master && git pull`, then
   `git switch -c feature/milestone-X`. X is the number of the milestone
   this branch works on: M1 is built on `feature/milestone-1`, M2 on
   `feature/milestone-2`, and so on. Do this only after the previous
   milestone's PR is merged into `master`.
2. **Open the PR after the first commit** on `feature/milestone-X`. Push
   the branch (`git push -u origin feature/milestone-X`), then
   `gh pr create --base master`. Give it a Conventional Commits title,
   such as `feat(m1): bill splitter`, and a short description of what the
   milestone delivers for the user.
3. **Commit and push freely** on that branch. Any commit the milestone
   workflow authorizes, or that the user asks for, can be made and pushed
   to the PR branch. Push after each commit so the PR and CI stay current.
   The trailer rules in the workflow commands still apply.
4. **Update the PR description** when the milestone's scope changes.
5. **After the user merges the PR,** go back to step 1 for the next
   milestone.

### What a PR to `master` must satisfy

- **All required checks pass.** `app` (app-ci.yml) and
  `workflow-conformance` are required. `pr-title` is required too, once
  its workflow is on `master`. The branch must be up to date with
  `master`. Branch protection enforces this for admins too.
- **The PR adds something,** and its title states what, as a
  Conventional Commit: `feat:` (a feature), `fix:` (a bug fix), or
  `perf:`, `refactor:`, `docs:`, `test:`, `build:`, `ci:`, `chore:`,
  `style:`, `revert:`. An optional scope is allowed (`feat(m1): ...`).
  Add `!` after the type or scope for a breaking change (`feat!: ...`).
  The `pr-title` check enforces the format.
- **The title sets the release version.** Every push to `master`
  publishes a GitHub Release (release.yml). The bump comes from the
  titles of the PRs merged since the previous tag: `!` → major,
  `feat` → minor, anything else → patch.

### Still never

- Never merge a PR. Merging is the user's decision, after the milestone
  gates (`/approve-review implementation`, `/accept-milestone`). PRs are
  merged with a **merge commit**; squash and rebase merges are disabled,
  because they would drop the per-checkpoint commits and their workflow
  trailers.
- Never commit or push to `master` directly.
- Never force-push. Never rebase, amend or otherwise rewrite a commit
  that has been pushed.
- Don't touch unrelated working-tree changes.
