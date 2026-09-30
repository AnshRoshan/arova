# Feature 04 — Teams and one-hop delegation

Goal: an agent can form a team from one sentence and consult a teammate, with every hop visible and counted.

## Contract
- Team intent proposes a roster of 2-4 specialists and creates nothing until `createTeam` is confirmed.
- Roster source: the configured model, else `fallbackRoster` keyword families. Name clashes are renamed by `decollide`, never dropped.
- Delegation: a separate routing pass (`routingPrompt`) answers `{"consult":null}` or `{"consult":{agent,question}}` before the reply is written. `MAX_DELEGATIONS` (default 1, 0 = off) caps hops; a peer is resolved by `resolvePeer`, which cannot return the caller.
- A consulted reply is three model calls: route, peer, integrate. All are counted in `model_usage`; the hop is stored in `delegations`.

Acceptance checks:
- Proposal card lists the roster and says nothing has been created; Create team adds the agents and wires `teamId`.
- The consult card names asker, peer, the exact question, and shows the peer's answer.
- A template echoed by the model (`<the single question for them>`) is replaced by the user's own question; a placeholder teammate aborts the hop.
- If the answer pass still emits a directive, the guard renders it as a sentence, never raw JSON.
- A failed router or peer failure degrades to an honest error, never a fabricated teammate answer.
- Team slip reports today's consult count; delegation works with no model key by refusing to consult.

Out of scope: multi-hop chains, agents creating agents themselves, delegation inside runs, peer-to-peer chatter without a user turn, any external tool.

## Flagged assumptions
- The router is a model judgement and will sometimes decline a useful consult or take an unnecessary hop. It is cheap to disable and its decision is visible in the thread.
- Peer answers are injected as a user-role message; a model that ignores the teammate's input is a prompt-quality problem, not a routing failure.
