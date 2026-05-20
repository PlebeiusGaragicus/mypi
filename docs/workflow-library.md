# Workflow Library

Workflow prompts are natural-language programs for the `workflow` preset. They live in:

```text
shared/prompts/workflow/
```

They are exposed by the `workflow` preset.

## Prompts

- `deepresearch.md`: citation-backed research with scouting, collection, synthesis, and validation.
- `pdf-ocr.md`: PDF acquisition/rendering/OCR workflow.
- `paper-ocr.md`: research-paper OCR plus embedded figure extraction.
- `kid-story.md`: small multi-worker handoff demonstration for story generation.
- `retro.md`: retrospective analysis of workflow traces.

## Usage

Start a clean workflow session, select the workflow preset, then run the desired prompt template:

```text
/new
/preset workflow
/deepresearch <topic>
```

Workflow prompts should define a program contract, execution graph, artifact paths, worker function calls, checkpoints, validation gates, and final output requirements.

## Program Shape

Each workflow should make clear:

- what inputs it accepts
- what state and artifacts it creates
- which graph nodes call which workers
- what each worker call receives as arguments
- what side effects and return values are expected
- how validation gates determine the next transition
- what the final response should include versus leave on disk
