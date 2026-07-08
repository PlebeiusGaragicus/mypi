---
name: how-to-debate
description: >-
  Structure debate notes into evidence-based Socratic Arguments: definitions,
  supporting clauses, main argument, steelman refutations, and rebuttals.
  Use when the user shares opponent quotes, a position blob, asks to think
  socratically, or wants a durable position paper in markdown.
  Help the user to "think socratically," stress-test a thesis, or structure an argument.
---

# How to debate

> `Hitch` (verb) to move (something) into a different position with a jerk

This skill is a bicycle for the mind on argumentation: collect thoughts into cogent, evidence-grounded position papers (`SocraticArgument`) that can be shared, refuted, and refined — as sharp and well-grounded as the best public debaters, without losing intellectual honesty. Aim for clarity and force, not ornament.

## Two modes

| Mode | Use when | Output |
|------|----------|--------|
| **Elenchus** (inquiry) | Thesis or key terms are still vague | Sharp questions that expose hidden premises; no full Argument yet |
| **Argument** (position paper) | User has a stance to document or defend | Markdown `SocraticArgument` per workflow below |

**Pipeline:** messy notes → elenchus on undefined terms → Argument draft → quality pass → file under `./arguments/` when the user wants it saved.

Default to connected prose in chat. When the user needs a **saved argument**, produce or update Argument markdown.

## Where arguments live

Save each Argument as `./arguments/<thesis-slug>.md`, relative to the project root — one thesis per file, slug derived from the thesis (e.g. `america-should-support-israel.md`). If `./arguments/` does not exist yet, offer to create it; a fresh directory needs no other scaffolding. Rebuttals and counter-positions that outgrow a nested section become sibling files that reference each other via `reply_to` frontmatter.

## Workflow

Do these steps in order. Do not write narrative before definitions for terms that appear in the thesis.

1. **Scope** — One-sentence thesis; name audience and what "success" means (persuade, clarify, archive).
2. **Terms** — List contested words (`ally`, `support`, etc.). Each becomes a `Definition` or `Highlight` before any narrative uses it.
3. **Supporting clauses** — Sub-claims that must hold for the thesis. Per clause: definitions/highlights → narrative only (no main thesis yet).
4. **Main argument** — Single `Clause` that depends on supporting clauses.
5. **Steelman refutations** — Strongest version of opponent claims; attach under the clause or thesis they attack.
6. **Rebuttals** — Your reply to each refutation (nested `Clause` or nested `SocraticArgument` when large).
7. **Open questions** — Explicit unknowns left for elenchus (scoped to undefined terms or evidence gaps).

## Markdown output (maps to schema)

Full sample: [vibecoding example](./examples/vibecoding.md).

Optional YAML frontmatter: `title`, `date`, `reply_to`, `author` (or nostr fields).

| Schema field | Markdown section |
|--------------|------------------|
| `SocraticArgument.title` | `# Thesis: …` |
| `abstract` | **Abstract:** paragraph |
| `supporting_clauses[]` | `## Supporting Clause: <title>` |
| `Clause.definitions` | `### Definitions and supporting evidence` |
| `Highlight` | Blockquote + **Source:** citation line |
| `Definition` | `` `Term:` `` definition text; optional inline refutation |
| `Clause.narrative` | `### Narrative` |
| `argument` (main) | `## Argument: <title>` (same subsections as a clause) |
| `refutations` | `## Refutation to: <target> \| Argument: <opponent claim>` then definitions + narrative; nest rebuttals the same way |

**Nesting rules**

- Place refutations **under** the clause or thesis they attack.
- A refutation may be a short pointer (`str`), a full opponent `Clause` (steelman), or a nested `SocraticArgument` for a large counter-position.
- One thesis per file; tangents become supporting clauses or separate Argument files.

Prefer plain headings over HTML color spans.

## Quality pass (before you ship)

- [ ] Every contested term in the thesis is defined or quoted **before** narrative uses it.
- [ ] Evidence is labeled: **quote/highlight** vs **inference** vs **speculation**.
- [ ] Refutations state the opponent's claim in words they would accept (steelman).
- [ ] Internal contradictions are named explicitly (e.g. two claims that cannot both hold).
- [ ] Reversibility: would the same principle apply if actors were swapped?
- [ ] One clear thesis; scope matches the user's actual question.

## Elenchus (when not writing an Argument yet)

Ask questions that stress-test reasoning, not politeness filler:

- What does the central term mean here (and what are plausible alternatives)?
- Against what alternatives is this position measured?
- What moral or historical framework justifies it—and what limits follow?
- What predictable consequences follow—and are they intended?
- Would you hold the same principle if roles were reversed?

Stop when terms and thesis are stable enough for step 1 of the workflow.

## What is a Socratic Argument?

A **SocraticArgument** is a self-contained side in a debate: a `SocraticArgument` made of `Clause` blocks, each with definitions and evidence, each open to refutation. That yields an "arguments all the way down" tree of claim, counterclaim, and reply—**evidence-based reasoning** you can share, attack, and refine, so beliefs earn their keep instead of hiding behind slogans.

## Argument data structure (normative schema)

Structure markdown to match these types; implementation in code is optional.

```python
from typing import Union, List, Optional
from pathlib import Path
from pydantic import HttpUrl
from langchain.schema import AIMessage, HumanMessage
from datetime import datetime

class Analysis:
    """This is AI-generated inference or analysis of the media"""

    prompt: HumanMessage
    """The prompt that was provided to the AI"""

    model: str
    """The model that was used to generate the analysis"""

    reply: AIMessage
    """The reply from the AI"""

class Bibliography:
    """Standardized metadata for generating citations (APA, MLA, etc.)"""

    author: Optional[str] = None
    """e.g., 'Karpathy, A.' or 'Stanford HAI'"""

    title: Optional[str] = None
    """The title of the article, post, or page"""

    published_date: Optional[datetime] = None
    """When the content was originally published"""

    publisher: Optional[str] = None
    """e.g., 'X', 'Medium', 'Nature'"""

    resource_type: Optional[str] = None
    """e.g., 'Post', 'Article', 'Dataset'"""

class Media:
    """This is a single file (photo, video, csv, etc)"""

    path: Path
    """The path to the media file"""

    ai_analysis: Optional[List[Analysis]] = None
    """This is AI-generated inference or analysis of the media"""

    bibliography: Optional[Bibliography] = None
    """Metadata for citation purposes"""

class WebResource:
    """This is a single web resource (photo, video, etc) and/or URL"""

    scrape: Media
    """The scrape of the web resource"""

    source_url: HttpUrl
    """The URL of the web resource"""

    timestamp: datetime
    """The timestamp of the web resource"""

    snapshot: Path
    """The PDF snapshot of the web resource taken at the time of the scrape"""

    ai_analysis: Optional[List[Analysis]] = None
    """
    This is AI-generated inference or analysis of the media.
    It may provide, for example, cleaned audio, a transcript of human dialogue, an analysis of a video which determines the make and model of a vehicle and or a summary of a podcast
    We may have multiple analysis, each with their own prompt
    """

    bibliography: Optional[Bibliography] = None
    """Metadata for citation purposes"""

class Highlight:
    """This is essentially a quote from a source (ebook, web article, etc)"""

    source: Union[Media, WebResource]

    quote: str #TODO; consider using cfiRange or some object to provide location data


class Definition:
    term: str

    media: List[Union[Media, WebResource]]
    """A list of media files (photo, video, etc) and/or list of URLs. Perhaps these would be kept in the same 'folder' together."""

    definition: str


class Clause:
    """This is a single-encapsulted "argument" or attempted statement of fact to establish our logic, block by block"""

    title: str

    definitions: Optional[List[Union[Definition, Highlight]]] = None
    """
    - our supporting evidence and 'grounding' that establishes meaning, common terms and provides point-of-view
    - it's also where we can `point to something` and quote it - like a book or article highlight
    """

    narrative: str
    """the body of an argument which pulls from earlier-defined fact"""

    refutation: Optional[List[Union[str, Clause, 'SocraticArgument']]] = None
    """
    - we may have a list of refutations, kept and replied to in order to establish our past thoughts on the issue, old ways of thinking, past contraversies, etc.
    - These can be included to further context to stregnthen our argument.
    - just like how individual Clauses may have a "counter" - if debating on-stage, this would be our interloquitor's counter content and message
    """



class SocraticArgument:
    """This `Argument` object defines a cogent argument or `position paper` from an author.  It is the self-contained material for one side in a debate"""

    title: str

    abstract: Optional[str] = None

    supporting_clauses: Optional[List[Clause]] = None

    argument: Clause

    refutations: Optional[List[Union[str, Clause, 'SocraticArgument']]] = None
```

## Examples

- [Vibecoding](./examples/vibecoding.md) — full sample
