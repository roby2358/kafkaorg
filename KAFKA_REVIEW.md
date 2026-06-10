# Kafka Review

An opinionated review of how Kafkaorg uses Kafka, from a Kafka-practices
perspective. The honest summary up front: **this codebase uses Kafka as a
durable mailbox, not as an event-streaming platform — and several choices that
look fine at one-conversation-per-process scale are anti-patterns that will bite
the moment you try to actually distribute it.**

## What the system does today

- Kafka is the **message bus between agents**, but deliberately *not* the
  message store. Records are thin envelopes (`ConversationMessage` in
  `src/kafka/types.ts`) carrying references — `docmem_node_id`, `node_id`,
  `action`, `conversation_id`, `agent_id` — with **no payload text**. Content
  lives in docmem (Postgres); consumers dereference it by node ID.
- Each conversation spawns a **UIAgent + ConversationalAgent** pair and **one
  Kafka topic** named after the conversational agent's instance ID
  (`framework.ts:96`). Both agents share that single bidirectional topic.
- Self-echo is avoided by two in-consumer filters in
  `BaseAgent.subscribeToTopic` (`BaseAgent.ts:84-100`): a `conversation_id`
  multiplexing guard and an `agent_id` "ignore my own messages" guard.
- Each agent gets its **own consumer group** (`agent-${this.id}`) and subscribes
  with `fromBeginning: true`, replaying full history on every start.
- Producer is a reused singleton; messages are keyed by `conversation_id`.
  Topics are created with **1 partition, replication factor 1**.
- Tool execution loops *through* Kafka: tool results are published back to the
  agent's own topic with `agent_id: 'tool'` so they pass the self-filter and get
  re-consumed.

## Where the design is genuinely good

**The claim-check pattern is correct and underrated.** Envelopes on Kafka,
content in docmem, is a textbook *claim-check* and the right call — Kafka is bad
at large payloads (default 1MB cap, broker memory pressure, replication
amplification). The one safety condition is that the store write must
*happen-before* the publish, which it does (`createMessageNode` then
`sendMessage`).

**Keying by `conversation_id` is right.** Per-key ordering is the one ordering
guarantee Kafka actually gives you, and the conversation is the correct
partitioning unit. This is the single most Kafka-literate decision in the
codebase.

**Versioned envelope.** A `version` field on the wire schema is the kind of
thing teams wish they'd added three years in. Cheap, forward-looking, correct.

## Where it diverges from Kafka practice — roughly in order of severity

**1. Topic-per-conversation is the headline anti-pattern.**
`createTopic(conversationalAgentId)` means topic count grows *unbounded with
conversations*. Topics are not cheap lightweight channels — every partition is
files on every broker, controller metadata, and cluster-state memory. Kafka
starts groaning in the low tens of thousands of partitions per cluster. The
idiomatic design is the **inverse**: a *small fixed number* of topics (e.g.
`agent.inbound`, `agent.outbound`), partitioned by `conversation_id`, with the
conversation as the *key*, not the topic. The code already keys by conversation
— it's 80% of the way to doing it right and then creates a topic anyway. The
topic-per-entity instinct comes from thinking of Kafka as RabbitMQ queues; it's
the most common mistake teams make coming from traditional MQ.

**2. Consumer-group-per-agent defeats the purpose of consumer groups.**
`groupId = agent-${this.id}` means every group has exactly one member and exists
for one agent's lifetime. Consumer groups are Kafka's mechanism for *scaling
out* and *fault-tolerant rebalancing*; a one-member ephemeral group uses none of
that and pays all the costs: offset-commit traffic, `__consumer_offsets` churn,
group-coordinator rebalance overhead, and orphaned groups after agents die
(requiring `delete-consumer-groups` reaping or they accumulate forever). This is
using the group API as a poor man's `assign()`. If agents are genuinely
singleton consumers, manual partition assignment with externalized offsets would
be more honest.

**3. `fromBeginning: true` + replay-on-restart is a time bomb.** Replaying the
entire topic on every spawn is O(conversation length) startup cost that grows
forever, and it conflates "I have no committed offset" with "I want full
history." Because each agent has its own throwaway group and agents get fresh
base62 IDs, the committed offset never helps — you replay from zero every time.
The correct primitive for "rebuild my state from the log" is **compaction or a
snapshot**, not unbounded replay.

**4. No retention or compaction strategy — and the two stores will diverge.**
Topics use default retention (typically 7 days) and silently delete records,
while docmem keeps content forever. After 7 days, replay-from-beginning produces
a *different, truncated* conversation than docmem holds. Either the log is the
source of truth (then it must be compacted/infinite and keyed for compaction) or
docmem is (then why replay the log at all — load state from docmem and use Kafka
only for live tailing). The current design half-commits to both and they will
drift. This is invisible in demos and corrupts conversations in week two.

**5. `numPartitions: 1` hard-codes away your only scaling axis.** Partition
count is effectively immutable in practice (adding partitions breaks key→
partition stability and thus ordering). One partition means a conversation can
never be processed by more than one consumer in parallel — and combined with
topic-per-conversation you get the worst of both: thousands of topics that each
can't scale. Few topics × many partitions would make partition count the
throughput knob. Here there's no knob.

**6. Self-filtering on a shared topic is a code smell, not a crime.** Both
agents reading one topic and discarding their own messages by `agent_id` works,
but every agent reads, deserializes, and compares every message it then throws
away — 2× the network and deserialization to emulate two directional streams on
one topic. Directional topics (or distinct partitions) would let the broker do
the routing for free. It's emulating in the consumer what the broker is designed
to do.

**7. Tool-results-via-Kafka is clever but blurs a boundary.** Looping tool
results back through the agent's own topic (with `agent_id: 'tool'` to dodge the
self-filter) makes everything a uniform event, but it sends an *in-process
function result* on a broker round trip — added latency, a partition write, a
replayable record — for data that never left the process. Is the tool result a
*durable conversational event* (then Kafka is right) or *transient execution
plumbing* (then it shouldn't be on the bus)? Treating it as the former is
defensible, but it should be a deliberate decision, and using a magic `agent_id`
string to slip past your own filter reads as a workaround rather than a design.

**8. Producer/consumer reliability defaults are unaddressed.** No `acks`,
idempotence, or retry config is set — so you're on KafkaJS defaults. For a
system where Kafka is supposedly the durable ordering spine, you'd want
`acks=all` + an idempotent producer to actually *get* that durability. Consumers
auto-commit, so a crash mid-`handleMessage` can silently drop or double-process,
and there's no transactional tie between "I consumed" and "I produced the
response." The "durable event log" framing is currently aspirational; the config
doesn't back it up.

## The meta-critique

The tell across all of this is that **Kafka is being used as a per-entity
durable queue (RabbitMQ/SQS mental model) wearing a Kafka costume.**
Topic-per-conversation, group-per-consumer, single-partition,
read-and-discard — these are all queue idioms. Kafka's actual strengths — *a few
fat partitioned logs, keyed ordering, consumer groups for elastic scaling,
compaction for state rebuild, replay as a feature not an accident* — are mostly
unused or actively worked around.

And for what this system currently is — agents as in-process objects in one Node
server, tracked in a `Map` — **it doesn't even need Kafka.** An in-memory event
emitter or Postgres `LISTEN/NOTIFY` would do everything the current design uses
Kafka for, with less operational weight. The justification for Kafka being here
at all is "positioned to distribute later" — but the *specific* choices made
(topic-per-conversation especially) are precisely the ones that **prevent**
distributing later. You'd have to rip out the topology to scale, at which point
early Kafka adoption bought migration pain rather than a head start.

## Recommendation

**Collapse to a handful of partitioned topics keyed by `conversation_id`, pick
*one* source of truth (docmem, with Kafka as a transient live bus + compacted
control topic), and either commit to real consumer-group semantics or drop to
explicit partition assignment.** Get those right and the rest of the instincts
here — claim-check, keying, versioning — are already sound enough to build on.

## Appendix: sketch of the few-topics-partitioned-by-conversation refactor

This is the contained version of the recommendation above. The goal: **stop
creating a topic per conversation, stop creating a consumer group per agent,**
and let `conversation_id` (already the message key) carry the routing the broker
is built to do. The blast radius is mostly `kafka/client.ts`, `framework.ts`,
and `BaseAgent.ts`.

### 1. Two fixed topics, provisioned once at startup

Replace per-conversation `createTopic(conversationalAgentId)` with a one-time
provisioning of directional topics. Directional (rather than one shared topic)
removes the self-filter and halves consumer work.

```ts
// kafka/client.ts
export const TOPICS = {
  toConversational: 'agent.inbound',   // UI -> conversational + tool results
  toUI:            'agent.outbound',    // conversational -> UI
} as const;

const PARTITIONS = Number(process.env.KAFKA_PARTITIONS ?? 24);

// Call once on boot, not per conversation.
export async function provisionTopics(): Promise<void> {
  const adminClient = await getAdmin();
  const existing = await adminClient.listTopics();
  const wanted = Object.values(TOPICS).filter(t => !existing.includes(t));
  if (wanted.length === 0) return;
  await adminClient.createTopics({
    topics: wanted.map(topic => ({
      topic,
      numPartitions: PARTITIONS,         // the throughput knob, set once
      replicationFactor: Number(process.env.KAFKA_RF ?? 1),
      configEntries: [
        // Pick ONE source of truth. If Kafka is canonical, compact instead of
        // delete so replay-from-state stays correct forever:
        // { name: 'cleanup.policy', value: 'compact' },
        { name: 'retention.ms', value: process.env.KAFKA_RETENTION_MS ?? '604800000' },
      ],
    })),
  });
}
```

`framework.createConversation` then **drops the `createTopic` call entirely** —
conversations become pure DB + docmem records. The `topics` table can keep
recording the logical pairing for the UI, but it no longer maps 1:1 to a Kafka
topic.

### 2. One consumer group per agent *role*, not per agent instance

This is the change that makes consumer groups earn their keep. All UIAgents join
group `ui-agents`; all ConversationalAgents join `conversational-agents`. Kafka
then load-balances partitions across however many instances are running, and
adding a second server is a scale-out, not a rewrite.

```ts
// BaseAgent.ts
protected abstract groupId(): string;        // 'ui-agents' | 'conversational-agents'
protected abstract inputTopic(): string;      // which fixed topic this role reads

protected async subscribeToTopic(fromBeginning = false): Promise<void> {
  const consumer = createConsumer(this.groupId());   // shared, stable group
  await consumer.connect();
  await consumer.subscribe({ topic: this.inputTopic(), fromBeginning });
  this.topics.set(this.inputTopic(), consumer);

  await consumer.run({
    eachMessage: async ({ message: kafkaMessage }) => {
      const raw = kafkaMessage.value?.toString();
      if (!raw) return;
      const parsed: ConversationMessage = JSON.parse(raw);

      // conversation_id is now the partition key, not a filter for correctness.
      // Only keep the multiplexing guard if an instance is pinned to a subset;
      // with role-groups, every partition's messages are legitimately yours.
      if (!this.ownsConversation(parsed.conversation_id)) return;

      await this.handleMessage(parsed, this.inputTopic());
    },
  });
}
```

Note what disappears: the **`agent_id === this.id` self-filter is gone**, because
a UIAgent reads only `agent.outbound` and a ConversationalAgent reads only
`agent.inbound` — neither sees its own writes. The tool-result loop stops needing
the magic `agent_id: 'tool'` dodge; tool results just get re-published to
`agent.inbound` like any other inbound event.

### 3. Routing by key, not by topic name

Producers already key by `conversation_id` (`BaseAgent.ts:125`) — keep that, it's
the part that was right. The only change is the *destination topic is now fixed
per direction*:

```ts
// UIAgent: user message -> conversational
await this.sendMessage(TOPICS.toConversational, message);

// ConversationalAgent: response -> UI
await this.sendMessage(TOPICS.toUI, responseMessage);

// ConversationalAgent: tool result -> back to itself via inbound
await this.sendMessage(TOPICS.toConversational, toolResultMessage);
```

Same partition for a conversation ⇒ same consumer instance ⇒ ordering preserved,
now *with* horizontal scalability instead of in spite of it.

### 4. State rebuild: stop replaying from the beginning

With a shared role-group, `fromBeginning` is wrong — a newly started instance
would replay the whole topic. Two correct options:

- **Docmem is the source of truth (recommended for this codebase):** on spawn,
  load conversation state from docmem (the agents already do this via
  `loadConversationDocmem`), and consume Kafka with `fromBeginning: false` —
  Kafka becomes a pure *live* bus. Retention can be short; drift disappears
  because there's only one canonical store.
- **Kafka is the source of truth:** switch the topics to `cleanup.policy=compact`
  keyed by `conversation_id`/`node_id`, and rebuild by reading the compacted log.
  Only worth it if you want Kafka-native replay independent of Postgres.

Either way, **pick one** — the current "both, and they silently diverge after the
retention window" is the bug to kill.

### 5. Reliability config to set while you're in here

```ts
kafka.producer({ idempotent: true, maxInFlightRequests: 1, acks: -1 /* all */ });
```

And move offset commits to *after* `handleMessage` succeeds (disable autocommit,
commit manually) so a crash mid-handle redelivers rather than silently drops.

### What this buys

| Property | Before | After |
|---|---|---|
| Topics | grows with conversations | fixed (2) |
| Consumer groups | one per agent, orphaned on death | one per role, stable |
| Scale-out across servers | impossible (in-process `Map`, 1 partition) | add instances, partitions rebalance |
| Self-echo handling | filter every message you wrote | structurally impossible |
| Store drift | log expires, docmem doesn't | one source of truth |
| Throughput knob | none | partition count |

The migration is real but bounded: it's `provisionTopics` at boot, deleting the
per-conversation `createTopic`, swapping two abstract methods into the agent
subclasses, and changing send destinations to the fixed topics. The
message *shape* (`ConversationMessage`), the claim-check to docmem, and the
keying all stay exactly as they are.
