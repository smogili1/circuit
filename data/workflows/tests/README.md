# Agent Test Workflows

Deterministic test workflows for validating Claude and Codex agent functionality.
Each test includes a **Validator** node that checks expected outputs.

## Test Files

| File | Tests | Input | Expected Output |
|------|-------|-------|-----------------|
| `claude-01-basic.yaml` | Basic execution, refs, text output, system prompt, model, maxTurns | "What is 7 plus 8?" | result="15", runCount=1 |
| `claude-02-json.yaml` | JSON structured output with schema | "Generate: name=Apple, color=Red, sweet=true" | {name:"Apple", color:"Red", sweet:true} |
| `claude-03-persist.yaml` | Conversation persist mode, memory across loops | "Remember secret: 42" then "What was it?" | secret=42, runCount=2 |
| `claude-04-transcript.yaml` | Transcript accumulation across runs | Say ALPHA/BETA/GAMMA | transcript contains all three |
| `codex-01-basic.yaml` | Basic execution, refs, text, baseInstructions, approval, sandbox | "What is 12 times 5?" | result="60", runCount=1 |
| `codex-02-json.yaml` | JSON structured output with schema | "Generate: name=Python, year=1991, compiled=false" | {name:"Python", year:1991, compiled:false} |
| `codex-03-persist.yaml` | Conversation persist mode, memory across loops | "Remember code: 99" then "What was it?" | code=99, runCount=2 |
| `codex-04-transcript.yaml` | Transcript accumulation across runs | Say ONE/TWO/THREE | transcript contains all three |
| `agents-05-chain.yaml` | Cross-agent reference interpolation | "Use number 7" | Claude→7, Codex→14, verify=true |
| `loops-06-nested-mock.yaml` | Complex nested loops with mock agent (JavaScript) | "Run nested loop mock test" | outer=3, innerAttempts=2, passed=true |

## Coverage Matrix

| Feature | Claude | Codex |
|---------|--------|-------|
| Basic execution | `01-basic` | `01-basic` |
| Reference interpolation `{{Node.field}}` | `01-basic` | `01-basic` |
| Text output format | `01-basic` | `01-basic` |
| JSON output + schema | `02-json` | `02-json` |
| System/Base prompt | `01-basic` | `01-basic` |
| Model selection | `01-basic` (haiku) | `01-basic` (gpt-5.2-codex) |
| maxTurns limit | `01-basic` | N/A |
| approvalPolicy | N/A | `01-basic` (never) |
| sandbox setting | N/A | `01-basic` (read-only) |
| Conversation mode fresh | `01-basic` | `01-basic` |
| Conversation mode persist | `03-persist` | `03-persist` |
| runCount tracking | `03-persist`, `04-transcript` | `03-persist`, `04-transcript` |
| Transcript accumulation | `04-transcript` | `04-transcript` |
| Cross-agent references | `05-chain` | `05-chain` |
| Nested loop behavior (mocked, deterministic) | `06-nested-mock` | `06-nested-mock` |

## Validation Structure

Each workflow includes a `Validator` JavaScript node that returns:

```javascript
{
  passed: boolean,        // true if all checks pass
  checks: {               // individual check results
    checkName: boolean,
    ...
  },
  actual: { ... },        // actual values received
  expected: { ... }       // expected values
}
```

## Running Tests

### Manual (UI)
1. Start servers: `make dev-start`
2. Open UI at http://localhost:5173
3. Load each test workflow from `workflows/tests/`
4. Run execution
5. Check Output node for `Validator.passed === true`

### Programmatic
```bash
# From backend directory
cd backend

# Run all tests
npm test

# The test-specs.json file contains expected values for automated validation
```

## Test Specs

The `test-specs.json` file contains detailed expected inputs/outputs for each node in each workflow. This can be used for automated test validation.
