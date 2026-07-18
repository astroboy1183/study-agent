# Daily Plan — 48 weeks / 336 days

> Auto-generated from plan.json. Nominal dates only; the agent's pointer is the real schedule.


## Week 1

- **Day 1 · Mon · theory** — **What a process actually is**  
  Address space (code/data/heap/stack segments), file descriptor table, registers, PCB. Read: `man 5 proc` sections on `/proc/<pid>/maps`, `status`, `fd`. Concept: the kernel is a scheduler juggling frozen snapshots of programs.
- **Day 2 · Tue · theory** — **Virtual memory from zero**  
  Every process believes it owns all of memory — a private hotel floor that's actually shared rooms with clever signage. Page tables translate virtual→physical; the TLB caches translations; a page fault is the kernel lazily fulfilling a promise. Demand paging, copy-on-write (why `fork()` of a 4GB process is instant). This is the same unified-memory territory you explored on Apple Silicon — now on your own machine.
- **Day 3 · Wed · theory** — **The page cache**  
  Free RAM is not wasted RAM: the kernel caches file pages aggressively. Why the *second* read of a big file is instant; why `free -h` "available" ≠ "free"; `echo 3 > /proc/sys/vm/drop_caches` and what dirty pages / writeback mean. Foreshadowing: Kafka's entire performance story is "let the page cache do the work."
- **Day 4 · Thu · theory** — **Syscalls and strace**  
  The user/kernel boundary: a syscall is a formal request across a security border (mode switch, not magic). Read about `read`/`write`/`open`/`mmap`. Watch/read one good strace tutorial (Julia Evans' strace zine is ideal and fun).
- **Day 5 · Fri · theory** — **Signals + systemd theory**  
  Signal delivery, handlers, why SIGKILL can't be caught, PID 1's special role (it must reap orphans — remember this in Docker week). systemd units, dependency graph, cgroup-per-unit design, journal architecture.
- **Day 6 · Sat · build** — **Deep Build — Linux Internals: Processes, Memory, Syscalls**  
  [Block A] Instrument your own bot fleet. For one running bot: dump `/proc/<pid>/maps` and annotate every region (binary, heap, stack, shared libs, anonymous mmaps). `strace -f -e trace=network,file -p <pid>` for 5 minutes — write down every syscall pattern you see and what the bot was doing. [Block B] Memory experiments. Python script that allocates 2GB in 100MB chunks — watch RSS grow in `top`; trigger the OOM killer inside a `systemd-run --scope -p MemoryMax=500M` unit and read the kernel log of the kill (`journalctl -k`). Then: write a 1GB file, drop caches, time a read; read again warm — measure the page cache speedup with `time` + `vmstat 1` running alongside. [Block C] Commit an annotated lab notebook (markdown) to a new `internals-labs` repo. This repo accumulates all Phase 0 evidence.
- **Day 7 · Sun · consolidate** — **Consolidate — Linux Internals: Processes, Memory, Syscalls**  
  [Block D] Rewrite one bot's systemd unit properly: `Restart=on-failure`, `MemoryMax=`, `CPUQuota=`, hardening options (`ProtectSystem=strict`, `PrivateTmp=true`) — read what each does, verify the bot still works, verify the sandbox by trying to write outside allowed paths from inside the service. [Block E] Vault note from memory: "Virtual memory, the page cache, and the OOM killer — explained to a junior." Then correct it against sources. [Block F] Drill aloud: "What happens, at the kernel level, when a process reads a file?" Plan Week 2.
  
  🎯 *Mastery:* Why is `fork()` of a huge process cheap, and what specific event makes copy-on-write finally pay its bill?

## Week 2

- **Day 8 · Mon · theory** — **TCP from zero, properly**  
  Handshake, sequence numbers, ACKs, retransmission, flow control (receive window) vs congestion control (cwnd, slow start, AIMD). TIME_WAIT and why servers accumulate it. A TCP connection is two independent one-way conveyor belts with receipts.
- **Day 9 · Tue · theory** — **Sockets as file descriptors + DNS + TLS**  
  `accept()` returns a *new* fd per connection (this is why "file descriptor limits" bite servers). DNS resolution chain end to end. TLS handshake: certificates prove identity (asymmetric), then both sides derive a symmetric session key. Just the shape, not the ciphers.
- **Day 10 · Wed · theory** — **B-trees for real**  
  Why disks force wide trees: one node = one page (typically 8KB in Postgres, 16KB in MySQL), fan-out of hundreds → any row in a billion-row table is 3–4 page reads. Node splits, why sequential inserts are kind to B-trees and random UUIDs are cruel. Contrast: LSM-trees (the DynamoDB/Cassandra family you know from AWS) — write-optimized memtable+SSTable+compaction vs read-optimized B-tree. DDIA ch. 3 is the reading; it's the best chapter in the book.
- **Day 11 · Thu · theory** — **WAL and MVCC**  
  Write-ahead log: durability = "write the intention sequentially before touching the real pages" (sequential writes are cheap — the page cache/disk lesson from Week 1). Crash recovery = replay the log. MVCC: writers make new row versions instead of overwriting; readers see a consistent snapshot; nobody blocks. Postgres specifics: xmin/xmax, why VACUUM exists (dead versions pile up), transaction ID wraparound as the famous production horror story.
- **Day 12 · Fri · theory** — **The query planner**  
  Parse → rewrite → plan → execute. Cost estimation from table statistics (`ANALYZE`), why stale stats produce insane plans, join strategies (nested loop / hash / merge) and when the planner picks each. Read the Postgres docs page "Using EXPLAIN" — it's short and canonical.
- **Day 13 · Sat · build** — **Deep Build — Networking + Database Storage Internals**  
  [Block A] Postgres in Docker + NYC taxi data (one month, ~2–3M rows, load via `COPY`). Baseline five analytical queries with `EXPLAIN (ANALYZE, BUFFERS)` — the BUFFERS option shows page cache hits vs disk reads, connecting Week 1 to Week 2 directly. [Block B] Index laboratory: add a B-tree index and re-explain (Seq Scan → Index/Bitmap Scan); build a covering index and achieve an Index Only Scan; demonstrate an index the planner *refuses* to use (low selectivity) and explain why it's right to refuse. Then break the planner: delete stats (`DELETE FROM pg_statistic`... or just load skewed data without ANALYZE) and capture one catastrophically wrong plan. [Block C] Lab notebook entry with before/after plans and buffer numbers.
- **Day 14 · Sun · consolidate** — **Consolidate — Networking + Database Storage Internals**  
  [Block D] MVCC theatre: two `psql` sessions side by side — demonstrate a non-repeatable read at READ COMMITTED, then fix it at REPEATABLE READ; force a serialization failure at SERIALIZABLE and handle the retry. Then run a mass UPDATE, observe table bloat (`pg_stat_user_tables.n_dead_tup`), VACUUM, observe again. [Block E] Vault note: "B-tree vs LSM-tree — where DynamoDB and Postgres disagree and why both are right." (Your DynamoDB background makes this note uniquely yours — future interview material.) [Block F] Drill: "Walk me through what happens inside Postgres when I run an UPDATE." Plan Week 3.
  
  🎯 *Mastery:* Your query is slow. Using only `EXPLAIN (ANALYZE, BUFFERS)` output, how do you distinguish "bad plan" from "cold cache" from "missing index" from "stale statistics"?

## Week 3

- **Day 15 · Mon · theory** — **CPython object model**  
  Everything is a `PyObject*` (refcount + type pointer); names are labels tied to objects, not boxes containing values (the classic mutable-default-argument bug falls out of this immediately). Reference counting + the cyclic GC as backup. `sys.getrefcount`, `id()`, small-int caching and string interning as the "gotcha" tour.
- **Day 16 · Tue · theory** — **The GIL, honestly**  
  One bytecode-executing thread at a time per interpreter. Why: refcounting isn't thread-safe. Consequence matrix: threads fine for I/O (GIL released during syscalls), useless for CPU; multiprocessing sidesteps it at IPC cost. The 3.13 free-threaded build as the horizon. This is *the* most-asked Python interview question — own it at the mechanism level.
- **Day 17 · Wed · theory** — **Iterators, generators, and the event loop**  
  Iterator protocol → generators as resumable stack frames (the frame object literally persists, suspended) → `async/await` as generators wearing a suit. The event loop from zero: a single-threaded scheduler running a ready-queue + a selector (epoll) watching fds — `await` means "park me, wake me when the fd is ready." Cooperative, not preemptive: one blocking call freezes the world.
- **Day 18 · Thu · theory** — **Memory + performance**  
  `__slots__` (kill the per-instance dict), `sys.getsizeof` lies (shallow), `tracemalloc` for truth. When NumPy wins: contiguous typed buffers vs arrays-of-pointers — this is a hardware story (cache lines, SIMD) told in Python. Profiling: `cProfile` for where, `py-spy` for live processes without stopping them.
- **Day 19 · Fri · theory** — **Modern packaging + Git surgery**  
  `pyproject.toml`, `uv` (adopt it — it's the correct 2026 answer), lockfiles, entry points. Git: interactive rebase mechanics, `bisect run` (automated bug hunting), reflog as the undo of last resort, pre-commit framework.
- **Day 20 · Sat · build** — **Deep Build — Python Internals + Git Discipline**  
  [Block A] Async surgery on one Telegram bot: convert its I/O path to asyncio properly (aiohttp/httpx-async), then *prove* the improvement — 50 concurrent simulated updates, latency histogram before/after. Then sabotage it: insert one `time.sleep(2)` (blocking) in a handler and watch every other task starve — screenshot the pathology, then fix with `asyncio.to_thread`. [Block B] Package it: `uv`-managed pyproject, `[project.scripts]` entry point, `ruff` + `mypy --strict` passing, pre-commit hooks, GitHub Actions running lint+type+test on push. This repo layout becomes your template for every future project. [Block C] Lab notebook: the starvation screenshot and the mechanism explanation.
- **Day 21 · Sun · consolidate** — **Consolidate — Python Internals + Git Discipline**  
  [Block D] GIL evidence session: CPU-bound task (sum of squares, 10⁸) run four ways — single thread, 4 threads, 4 processes, NumPy vectorized. Table of timings. Explain every number from the mechanism (the 4-thread result should be *slightly worse* than single — explain the overhead). Git drill: plant a subtle bug 15 commits deep in a scratch repo; find it with `git bisect run pytest`. [Block E] Vault note: "The GIL, the event loop, and when each concurrency tool wins" — with your own benchmark table embedded. [Block F] Drill: "Threads vs asyncio vs multiprocessing — pick one for these five workloads and defend it." Plan Phase 1.
  
  🎯 *Mastery:* Why can an asyncio server handle 10K connections on one thread while a thread-per-connection server dies, and what *single line of code* can destroy that advantage?

## Week 4

- **Day 22 · Mon · theory** — **Replication I**  
  DDIA ch. 5 first half. Leader-based replication, sync vs async replicas and the durability/latency dial, replication lag pathologies: read-your-own-writes, monotonic reads, consistent prefix. You've already met this skeleton twice: Postgres streaming replication and Kafka ISR are the same idea in different clothes.
- **Day 23 · Tue · theory** — **Replication II**  
  Multi-leader (conflict hell) and leaderless (Dynamo-style — your old team's namesake): quorums (R+W>N), sloppy quorums, hinted handoff, read repair. Map each concept to what you remember of DynamoDB's behavior.
- **Day 24 · Wed · theory** — **Partitioning**  
  DDIA ch. 6. Hash vs range partitioning, hot spots/skew (celebrity problem), rebalancing strategies, secondary indexes across partitions (local vs global — DynamoDB LSI vs GSI is exactly this). Partitioning is the same idea whether it's called shards (Mongo), partitions (Kafka), or splits (BigQuery).
- **Day 25 · Thu · theory** — **Transactions & consistency**  
  DDIA ch. 7 + ch. 9 highlights. Isolation levels revisited at the distributed scale, linearizability vs eventual consistency (linearizable = the system behaves as if there's one copy), CAP as a limited-but-real tradeoff, why "exactly-once" always means "at-least-once + idempotence/transactions."
- **Day 26 · Fri · theory** — **Consensus**  
  DDIA ch. 9 second half. Why electing a leader is hard (split brain), Raft at the intuition level: terms, majority votes, log replication (a committee that can lose members mid-meeting and still produce one agreed minutes document). Where it hides in your stack: Kafka KRaft, etcd under Kubernetes, ZooKeeper of old.
- **Day 27 · Sat · build** — **Deep Build — Distributed Systems Foundations (DDIA Core)**  
  [Block A] Build a toy replicated KV store in Python (~200 lines): one leader, two followers, HTTP replication. Implement sync vs async replication as a flag; measure write latency difference. [Block B] Break it deliberately: kill a follower mid-write (async mode) and demonstrate data loss on promotion; then demonstrate that sync mode survives the same failure but stalls when a follower is down. Write the incident report for each. [Block C] Commit to `internals-labs` with the incident reports.
- **Day 28 · Sun · consolidate** — **Consolidate — Distributed Systems Foundations (DDIA Core)**  
  [Block D] Extend: add naive quorum reads (R=2, W=2, N=3) and demonstrate read-repair fixing a stale replica. +KN session. [Block E] Vault note: "Five ideas that every distributed system reuses" (replication, partitioning, quorums, idempotence, consensus) — one paragraph each, with the systems you'll meet later listed under each. [Block F] Drill: "Design a system with 99.99% read availability for user profiles — walk through the replication choices." Plan Week 5.
  
  🎯 *Mastery:* Why does R+W>N give you consistency, exactly what kind of consistency does it give, and what can still go wrong?

## Week 5

- **Day 29 · Mon · theory** — **OLTP vs OLAP from zero**  
  Normalized write-optimized vs denormalized read-optimized; row vs column orientation preview. The librarian's card catalog vs the staff-picks table. FoDE's storage chapter as light companion reading.
- **Day 30 · Tue · theory** — **Facts, dimensions, and grain**  
  Kimball ch. 1. Grain = the sentence "one row in this table represents exactly ___" — decided *first*, before any column. Additive/semi-additive/non-additive facts (account balance can't be summed across time — semi-additive is the interview trap).
- **Day 31 · Wed · theory** — **Star schema mechanics**  
  Kimball ch. 2–3. Why stars beat snowflakes in practice (join count, BI tool friendliness, columnar compression handles the redundancy). Surrogate keys: why you never trust source-system IDs (they get reused, they leak meaning, they break on source migration).
- **Day 32 · Thu · theory** — **Fact table taxonomy**  
  Transaction, periodic snapshot, accumulating snapshot — one deep example each. Factless fact tables (events with no measure — attendance, eligibility). Map to your SPV Databricks work: classify what your Gold tables actually were.
- **Day 33 · Fri · theory** — **Conformed dimensions + bus matrix**  
  The enterprise pattern: one `dim_customer` serving many stars = the thing that makes "revenue by customer" and "tickets by customer" joinable. Degenerate dimensions (order number lives in the fact). Sketch a bus matrix for an e-commerce firm on paper.
- **Day 34 · Sat · build** — **Deep Build — Dimensional Modeling I (Kimball Fundamentals)**  
  [Block A] Design a full model for a Swiggy-style food-delivery platform. Write the grain sentence for three candidate fact tables (order placed / order item / delivery status change), pick, justify. Full DDL: fact + dims (customer, restaurant, rider, menu item, date, time-of-day) with surrogate keys. [Block B] Generate believable synthetic data with Python + Faker + NumPy distributions (order volumes with daily/weekly seasonality, power-law restaurant popularity — realistic skew matters for later weeks). Load into Postgres. Write 8 analytical queries a business would actually ask. [Block C] Repo: `lakehouse-capstone` is born — this model survives all the way to Week 18.
- **Day 35 · Sun · consolidate** — **Consolidate — Dimensional Modeling I (Kimball Fundamentals)**  
  [Block D] Date dimension done right: generate a 10-year `dim_date` with fiscal periods, holidays (India), weekday flags — the unglamorous artifact every real warehouse has. Add `dim_time_of_day`. Re-run queries using them. +KN. [Block E] Vault note: "Grain — the one decision that makes or breaks a model," with your three candidate grains as the worked example. [Block F] Drill aloud: "Model ride-sharing for analytics" — 10 minutes, paper only. Plan Week 6.
  
  🎯 *Mastery:* A stakeholder asks for "average delivery time by restaurant by week." Which fact table grain makes this trivial, which makes it a trap, and why?

## Week 6

- **Day 36 · Mon · theory** — **SCD taxonomy**  
  Types 0–7 exist; 1, 2 dominate reality. Type 2 mechanics in full: surrogate key per version, `effective_from`/`effective_to`/`is_current`, and the join pattern for point-in-time correctness (`ON fact.customer_sk = dim.customer_sk` — the fact row froze the version at load time).
- **Day 37 · Tue · theory** — **SCD2 edge cases**  
  Late-arriving dimension rows (fact arrives before its dimension version — the "early fact" problem, placeholder members), late-arriving *changes* (retro-effective updates that require splitting an existing version's validity window), multiple changes in one batch, deletes in the source.
- **Day 38 · Wed · theory** — **One Big Table**  
  The columnar-era counterargument: storage is cheap, joins aren't free, BI users are join-averse. When OBT wins (small team, narrow domain, dashboard speed) and its decay mode (SCD handling becomes rewrite-the-world; column sprawl; no reuse).
- **Day 39 · Thu · theory** — **Data Vault**  
  Hubs (business keys), links (relationships), satellites (attributes + history). Insert-only, parallel-loadable, audit-perfect — and query-hostile (join explosion; you build marts on top anyway). When it's genuinely chosen: many volatile sources, compliance-heavy shops, banks.
- **Day 40 · Fri · theory** — **Synthesis + position**  
  The layered answer: staging → (vault or 3NF core, *only if* audit/integration complexity demands) → dimensional marts. For most modern teams: staging → dbt → star or OBT marts. Write your one-page position doc — this is a senior-interview differentiator: having an *opinion with reasons*.
- **Day 41 · Sat · build** — **Deep Build — Dimensional Modeling II (SCD, Data Vault, OBT)**  
  [Block A] Hand-roll SCD2 in pure SQL (MERGE) for `dim_customer` and `dim_restaurant`: handle new members, changed attributes (close old version, open new), unchanged rows (no-op), and deletes (soft-close). No dbt yet — you must own the raw mechanics before tools hide them. [Block B] Edge-case gauntlet: simulate a late-arriving change (a customer address change with `effective_from` last Tuesday, arriving today) and correctly split the existing version window. Simulate an early fact (order for a customer not yet in the dim) with a placeholder member and later backfill. These two exercises are worth more than most courses. [Block C] Commit with a `docs/scd2-edge-cases.md` walkthrough.
- **Day 42 · Sun · consolidate** — **Consolidate — Dimensional Modeling II (SCD, Data Vault, OBT)**  
  [Block D] Point-in-time proof: write the query "where did customer 42 live on March 3rd" and verify against the simulated history. Then build a tiny OBT variant of your model and compare query ergonomics honestly. +KN. [Block E] Vault note: "SCD2 including the parts tutorials skip" (late changes, early facts). [Block F] Drill: "The source system hard-deletes rows. How does your SCD2 dimension cope?" Plan Week 7.
  
  🎯 *Mastery:* A dimension change arrives dated three weeks in the past. Write (mentally) the exact sequence of UPDATE/INSERT operations that repairs history without breaking any existing fact join.

## Week 7

- **Day 43 · Mon · theory** — **The execution model**  
  Driver (plans, coordinates) and executors (JVMs doing work); a DataFrame is a plan, not data; lazy evaluation → nothing runs until an action. Jobs → stages → tasks; the stage boundary IS the shuffle. Cricket frame: driver = captain setting the field; executors = fielders; a shuffle = the drinks break where the entire field repositions.
- **Day 44 · Tue · theory** — **Narrow vs wide + reading plans**  
  `filter/map/withColumn` (narrow: data stays put) vs `groupBy/join/distinct/repartition` (wide: data moves). `df.explain(True)` anatomy: Parsed → Analyzed → Optimized logical plan → Physical plan. Exchange = shuffle. Learn to *count the Exchanges* before running anything.
- **Day 45 · Wed · theory** — **Catalyst optimizer**  
  Rule-based rewrites you should recognize in plans: predicate pushdown (filter travels to the scan), column pruning (read only needed columns — pairs with Parquet later), constant folding, join reordering. Why UDFs are optimization black holes (Catalyst can't see inside) and pandas UDFs as the partial fix.
- **Day 46 · Thu · theory** — **Tungsten + whole-stage codegen**  
  Off-heap binary row format (UnsafeRow — no JVM object overhead, no GC pressure), cache-friendly memory layout (your hardware interest cashes in here), and whole-stage code generation: Spark compiles your plan into a single fused Java function per stage (look for `*` markers in physical plans). This is why DataFrames crush RDDs — it's a compiler story.
- **Day 47 · Fri · theory** — **The shuffle, mechanically**  
  Map side: each task sorts/partitions output into shuffle files on local disk. Reduce side: tasks fetch their slice from every map task over the network (all-to-all). Why shuffle = disk I/O + network + serialization — the three most expensive things a cluster does, in one operation. `spark.sql.shuffle.partitions` default 200 and why it's almost always wrong for your data size.
- **Day 48 · Sat · build** — **Deep Build — Spark Internals I (Architecture, Catalyst, Tungsten)**  
  [Block A] Local PySpark. Generate 10GB synthetic events (reuse food-delivery generator, scaled). Baseline workload: filter → join orders-to-restaurants → groupBy aggregate → write Parquet. Open Spark UI (localhost:4040) and produce an annotated tour: for each stage — input size, shuffle read/write, task count, duration distribution. Screenshot everything. [Block B] Plan-reading drills: (1) show predicate pushdown appearing in the plan when filtering a Parquet read, then defeat it with a UDF-wrapped filter and show the difference in bytes scanned; (2) find the `*` codegen markers and identify what fused; (3) change `shuffle.partitions` 200 → 24 → 2000 on the same job, record wall-clock + task overhead, explain the U-shaped curve. [Block C] Commit annotated screenshots + notes.
- **Day 49 · Sun · consolidate** — **Consolidate — Spark Internals I (Architecture, Catalyst, Tungsten)**  
  [Block D] UDF tax measurement: same transformation three ways — native functions, Python UDF, pandas UDF — timed on identical data. Table + mechanism explanation (serialization boundary, batch vs row). +KN. [Block E] Vault note: "How Spark turns my DataFrame code into JVM bytecode" — the Catalyst→Tungsten pipeline in your own words. [Block F] Drill: "Why are DataFrames faster than RDDs? Go deeper than 'optimization.'" Plan Week 8.
  
  🎯 *Mastery:* You see three Exchange nodes in a physical plan but expected two. What are the likely causes, and which plan lines confirm each hypothesis?

## Week 8

- **Day 50 · Mon · theory** — **Unified memory model**  
  Executor memory split: execution (shuffles, joins, sorts) vs storage (cache), unified and mutually evictable — execution can evict cached blocks, not vice versa. On-heap vs off-heap, `memoryOverhead` (Python workers live here — the classic PySpark OOM that isn't in the heap at all). Spill: when execution memory runs out, sort/aggregate spills to disk — silent 10x slowdowns; find "spill (memory/disk)" in the UI.
- **Day 51 · Tue · theory** — **Join strategies**  
  Broadcast hash (mail every fielder a copy of the small table), shuffle hash, sort-merge (the big-big default: shuffle both, sort both, zipper-merge). Selection logic + `autoBroadcastJoinThreshold` + broadcast hints. Failure mode: broadcasting something too big → driver OOM.
- **Day 52 · Wed · theory** — **Skew**  
  One hot key → one whale partition → one straggler task holding the whole stage hostage (the tailender everyone waits for, except he's facing 90% of the balls). Detection: task duration/size distribution in the UI. The math: p99 stage time is set by the max task, not the mean.
- **Day 53 · Thu · theory** — **Skew fixes**  
  Salting by hand: explode hot keys with random suffixes on one side, replicate the other side across all salts, join on (key, salt), re-aggregate — understand why the replication is necessary. Broadcast as skew-killer when the other side is small. Filter-and-union hybrid (handle the whale keys separately).
- **Day 54 · Fri · theory** — **AQE**  
  Runtime re-planning off actual shuffle statistics: partition coalescing (fixes the 200-problem automatically), dynamic join switching (sort-merge → broadcast when a side turns out small), automatic skew-join splitting (chops whale partitions). What AQE cannot fix: bad data layout, UDF walls, wrong algorithms. Know the config flags.
- **Day 55 · Sat · build** — **Deep Build — Spark Internals II (Memory, Skew, Joins, AQE)**  
  [Block A] Manufacture pathology: dataset where one restaurant has 30% of all orders. Run the join with AQE *off* — capture the straggler in the UI timeline (one task running minutes after all others finished). This screenshot is interview gold. [Block B] Fix it three ways, timed: (1) hand salting (implement fully — this is the exercise that separates users from mechanics), (2) AQE on, (3) broadcast (shrink the dim side to make it viable). Results table with wall-clock + max-task-time for each. [Block C] Write `docs/skew-postmortem.md` — problem, detection evidence, three fixes, numbers, recommendation.
- **Day 56 · Sun · consolidate** — **Consolidate — Spark Internals II (Memory, Skew, Joins, AQE)**  
  [Block D] Memory pathology tour: force a spill (huge aggregation, tiny executor memory) and find it in the UI; force a PySpark overhead OOM and read the error; fix both via config and record the exact settings. +KN. [Block E] Vault note: "Debugging slow Spark: my decision tree" — from symptom (slow stage) through UI evidence to fix. Make it a literal flowchart. [Block F] Drill: "Your nightly job's runtime doubled with no code change. Go." Plan Week 9.
  
  🎯 *Mastery:* Salting requires replicating the non-skewed side N times. Derive why — what breaks if you salt only the skewed side?

## Week 9

- **Day 57 · Mon · theory** — **The log abstraction**  
  Kafka from zero: a distributed, append-only, replayable log — not a queue (queues forget; logs remember and let you rewind). Topics → partitions → offsets; ordering guaranteed within a partition only; the partition is the unit of parallelism, ordering, and replication. Choosing a partition key = choosing your ordering guarantee AND your skew risk (Week 8 déjà vu — a hot partition is data skew wearing a Kafka shirt).
- **Day 58 · Tue · theory** — **The storage engine (Week 1 pays off)**  
  Partitions = directories of segment files; writes append to the active segment; sparse index files map offset → file position. Kafka barely uses application memory: it writes to the page cache and lets the kernel flush; reads of recent data are pure page-cache hits. Zero-copy (`sendfile`): data flows disk → page cache → NIC without entering user space. Kafka is fast because it *cooperates with the kernel* — this is your Week 1 knowledge earning rent.
- **Day 59 · Wed · theory** — **Retention + compaction**  
  Time/size-based retention (segments deleted whole), log compaction (keep latest value per key — a changelog becomes a table; foreshadowing stream-table duality). Tombstones for deletes.
- **Day 60 · Thu · theory** — **Producers I**  
  Send path: serializer → partitioner (key hash → partition; sticky partitioning for null keys) → record accumulator (per-partition batches) → sender thread. `batch.size` + `linger.ms`: the throughput/latency dial (wait a little, send a lot). Compression per-batch (lz4/zstd) and why batching makes compression dramatically better.
- **Day 61 · Fri · theory** — **Producers II: durability contract**  
  `acks=0/1/all` matrix; idempotent producer (producer ID + per-partition sequence numbers → broker de-dupes retries — retries become safe); `max.in.flight` and the ordering interaction; delivery timeout vs request timeout. The safe-producer recipe and what each setting costs.
- **Day 62 · Sat · build** — **Deep Build — Kafka Internals I (Storage Engine + Producers)**  
  [Block A] Kafka in Docker (KRaft, single broker to start). Create a topic with 6 partitions; write a Python producer generating your food-delivery event stream at ~10K events/sec. Then go spelunking: `ls` the log directory inside the container, find segment/index files, dump one with `kafka-dump-log` and read actual record batches. [Block B] Producer physics lab: measure throughput and p99 latency across a grid — `acks` (1 vs all) × `linger.ms` (0 vs 20) × compression (none vs lz4). 8 configurations, one table. Explain every number from the mechanism. [Block C] Commit the lab with the table.
- **Day 63 · Sun · consolidate** — **Consolidate — Kafka Internals I (Storage Engine + Producers)**  
  [Block D] Partitioning experiments: key by `restaurant_id` with your power-law data → watch one partition bloat (measure per-partition sizes); switch to a composite key and re-measure. Compaction demo: compacted topic, same key written 100 times, force compaction, count survivors. +KN. [Block E] Vault note: "Why Kafka is fast: an OS story" — page cache, sequential I/O, zero-copy, batching. [Block F] Drill: "Kafka claims millions of messages/sec on modest hardware. Explain the four design choices that make that possible." Plan Week 10.
  
  🎯 *Mastery:* With `acks=all` and idempotence on, a producer retry happens after a network blip. Trace exactly why no duplicate lands in the log — which IDs and numbers are compared, and where?

## Week 10

- **Day 64 · Mon · theory** — **Replication + ISR**  
  Leader/followers per partition; followers fetch like consumers; ISR = the set keeping up (`replica.lag.time.max.ms`). High watermark = last offset replicated to all ISR = what consumers may read. `min.insync.replicas` + `acks=all` = your written durability contract; the `unclean.leader.election` tradeoff (availability vs data loss) — decide it like an adult, per topic.
- **Day 65 · Tue · theory** — **KRaft**  
  ZooKeeper's old job (metadata, controller election) now done by an internal Raft quorum — Week 4's consensus theory in production clothing. Controller responsibilities: leader election on broker failure, partition reassignment. Walk through a broker-death timeline: detection → election → metadata propagation → client refresh.
- **Day 66 · Wed · theory** — **Consumers I**  
  Consumer groups: each partition → exactly one consumer per group (partitions cap your parallelism — a 6-partition topic feeds at most 6 consumers). Offset commits to `__consumer_offsets`; auto-commit as the classic footgun (commit-before-process = message loss; process-before-commit = duplicates — know which failure produces which).
- **Day 67 · Thu · theory** — **Consumers II: rebalancing**  
  Triggers (join/leave/crash/`max.poll.interval.ms` exceeded — the "slow processing masquerading as death" classic). Eager (stop-the-world) vs cooperative-sticky (incremental) protocols; static membership for rolling restarts. Rebalance storms: symptoms, causes, cures.
- **Day 68 · Fri · theory** — **Exactly-once, demystified**  
  The honest hierarchy: at-least-once + idempotent consumer is the workhorse (design your sink for idempotence — MERGE, unique keys — and stop fearing duplicates). Kafka transactions: atomic produce-to-multiple-partitions + offset commit in one transaction (`read_committed` consumers, transactional.id, zombie fencing via epochs). What EOS covers (Kafka→Kafka pipelines) and what it never covered (side effects to external systems — your database write is on you).
- **Day 69 · Sat · build** — **Deep Build — Kafka Internals II (Replication, Consumers, Exactly-Once)**  
  [Block A] Three-broker Docker Compose cluster, topic with RF=3, `min.insync.replicas=2`. Kill the leader mid-produce (`docker kill`): watch election in logs, measure producer stall, verify zero loss with a sequence-checking consumer. Then kill *two* brokers and watch `acks=all` produce correctly refuse (NotEnoughReplicas) — the contract enforcing itself. [Block B] Rebalance lab: 3-consumer group, kill one mid-flow — observe partition reassignment with eager vs cooperative-sticky protocols (time the pause each causes). Then simulate the slow-consumer death spiral: processing time > `max.poll.interval.ms` → forced rebalance loop; fix it properly (tune interval + reduce `max.poll.records`). [Block C] Incident reports for both labs.
- **Day 70 · Sun · consolidate** — **Consolidate — Kafka Internals II (Replication, Consumers, Exactly-Once)**  
  [Block D] Duplicates-and-loss demo: build the commit-before-process consumer and *prove* message loss on crash (sequence gaps); build process-before-commit and prove duplicates; then make the sink idempotent (Postgres upsert on event ID) and prove correctness under crashes. This trilogy IS streaming engineering. +KN. [Block E] Vault note: "Exactly-once is a system property, not a Kafka setting" — with your three demos as evidence. [Block F] Drill: "Consumer lag is growing on one partition only. Diagnose." Plan Week 11.
  
  🎯 *Mastery:* `acks=all`, RF=3, min.insync=2: the leader acks a write, then dies before one follower catches up. Can that write be lost? Walk the high-watermark logic to the answer.

## Week 11

- **Day 71 · Mon · theory** — **Time, from zero**  
  Event time vs processing time; the gap between them (network, retries, offline devices) is where all streaming bugs live. Out-of-orderness is the norm, not the exception. The bus-timetable frame: event time = when the bus actually left; processing time = when the report reached HQ.
- **Day 72 · Tue · theory** — **Watermarks, derived**  
  The system's rolling declaration: "I believe no events older than X remain in flight." Watermark = max observed event time − allowed lateness. What it gates: when windows finalize, when state gets evicted. Within watermark = counted; beyond = dropped or dead-lettered. Unbounded state without watermarks = slow memory death. You built this in PulseBoard — now re-derive it and audit your implementation against the derivation.
- **Day 73 · Wed · theory** — **Windows + state**  
  Tumbling, sliding, session (gap-based — closes only via watermark). Where state lives: Spark's HDFS/RocksDB-backed state store; checkpointing = offsets + state, atomically. Output modes (append waits for window finality; update emits revisions) and why append + no watermark = error.
- **Day 74 · Thu · theory** — **Structured Streaming specifics**  
  Micro-batch model (latency floor ~100ms–seconds; simple recovery), `foreachBatch` as the workhorse escape hatch (per-batch MERGE into Delta — the pattern behind half of production Databricks), stream-stream joins and their state implications, `dropDuplicates` with watermark for dedup.
- **Day 75 · Fri · theory** — **Flink contrast**  
  True event-at-a-time (lower latency, per-event timers), Chandy–Lamport checkpoint barriers (a marker flows through the dataflow; each operator snapshots on barrier arrival — a consistent global photo without stopping the world; genuinely one of CS's prettier algorithms). When Flink: CEP, huge keyed state, sub-100ms needs. When Structured Streaming: you live in Spark/Databricks, ops simplicity, batch-stream code sharing. Have the opinion ready.
- **Day 76 · Sat · build** — **Deep Build — Streaming Semantics (Structured Streaming + Flink)**  
  [Block A] PulseBoard surgery I: rebuild its core aggregation with explicit watermark + session windows on your Kafka event stream. Feed it a generator that produces 5% late events (some within lateness, some beyond) and 2% duplicates — verify counts: on-time counted, tolerably-late counted, hopelessly-late routed to a dead-letter Delta table (via foreachBatch), duplicates dropped. [Block B] Recovery drill: kill the streaming job mid-batch; restart from checkpoint; prove no loss/no double-count in the sink (sequence audit). Then break it on purpose: change the query shape (add a column to the groupBy) against the old checkpoint and meet the checkpoint-incompatibility error every production team meets — document the recovery options. [Block C] Update PulseBoard README with the new semantics section.
- **Day 77 · Sun · consolidate** — **Consolidate — Streaming Semantics (Structured Streaming + Flink)**  
  [Block D] Latency profile: measure end-to-end p50/p99 (event produced → row in sink) across trigger intervals (1s / 10s / continuous processing if available). Table + analysis. +KN. [Block E] Vault note: "Watermarks, derived from first principles" — if you can't derive it, you don't own it. [Block F] Drill: "Your daily counts from the stream don't match the batch backfill. List every possible cause." Plan Week 12.
  
  🎯 *Mastery:* A session window with a 30-min gap has been open for 6 hours because one user trickles events. What exactly closes it, and what config bounds your state size?

## Week 12

- **Day 78 · Mon · theory** — **Catch-up — finish an unfinished build**  
  Breather week, no new material. Go back to any build from the Spark & Kafka weeks you left half-done or skipped and finish it properly — a working, documented artifact beats moving on with a hole in it. If everything's done, take your weakest build and harden it: tests, error handling, a README diagram.
- **Day 79 · Tue · theory** — **Re-answer the mastery checks, cold**  
  Re-answer the Weeks 5-11 mastery questions out loud, from memory, no notes. Each one you fumble marks a topic to re-read today. This is the honest audit — the whole point of the week is to find the soft spots while they're still cheap to fix.
- **Day 80 · Wed · theory** — **Re-read the one topic that's still fuzzy**  
  Pick the single concept from this stretch that still feels hand-wavy and re-read the primary source on it — the doc, the paper, the DDIA chapter, not a blog. Depth on one shaky idea now prevents a collapsed build later.
- **Day 81 · Thu · theory** — **Teach it back (vault note)**  
  Write one vault note explaining a concept from this stretch from memory, as if teaching a sharp junior. Writing from memory is the retention step; the gaps you hit while writing are precisely what you hadn't actually learned.
- **Day 82 · Fri · theory** — **Light day + Work Debrief**  
  Rest the brain — optional light reading only. Do the 15-minute Work Debrief: what broke at work this week, which roadmap topic explains it, what you'd do differently. Log it.
- **Day 83 · Sat · build** — **No new build — finish, or rest**  
  No new build this week. If a the Spark & Kafka weeks build is unfinished, use this long block to take it end-to-end. If you're fully caught up: rest guilt-free, or refactor and document one prior build until it's portfolio-ready. Momentum is protected by rest, not spent by it.
- **Day 84 · Sun · consolidate** — **Consolidate the stretch**  
  Consolidate everything so far: skim your vault notes, confirm every Weeks 5-11 mastery check you can now answer cold, and jot the 2-3 threads still weakest — those become next week's morning warm-ups. Then stop. You've earned the reset.
  
  🎯 *Mastery:* Can you answer every Weeks 5-11 mastery check cold? List the ones you can't — that list is your real progress map.

## Week 13

- **Day 85 · Mon · theory** — **MPP from zero**  
  Massively parallel processing: a query becomes a distributed plan over many nodes, each owning a data slice — Spark's model, but as a long-running database. Shared-nothing vs shared-disk vs the modern answer: separation of storage and compute (object store + stateless compute), which is *the* architectural idea of the last decade — elasticity, independent scaling, pay-per-use.
- **Day 86 · Tue · theory** — **Snowflake architecture**  
  Three layers: cloud services (parser, optimizer, metadata, transactions) / virtual warehouses (stateless compute clusters) / centralized object storage in **micro-partitions** (50–500MB compressed columnar chunks) with min/max metadata per column → partition pruning (Parquet row-group pruning's big sibling). Clustering keys, automatic reclustering, why time travel is nearly free (immutable micro-partitions + metadata pointers).
- **Day 87 · Wed · theory** — **BigQuery / Dremel**  
  Storage: Capacitor columnar format on Colossus. Compute: Dremel's tree of executors, and **shuffle via disaggregated memory** rather than local disk. Slots as the compute currency; on-demand (bytes-scanned pricing — why `SELECT *` is a billing event) vs capacity pricing. Partitioning + clustering as your cost-control levers.
- **Day 88 · Thu · theory** — **The optimizer's world**  
  Columnar execution: vectorized processing (operate on column batches, SIMD-friendly — hardware interest cashes in again), late materialization, cost-based optimization with statistics, result caches / materialized views. Why "it depends on the statistics" is the true answer to most performance questions.
- **Day 89 · Fri · theory** — **Compare-and-contrast synthesis**  
  Databricks SQL (Photon: vectorized C++ engine over Delta), Snowflake, BigQuery — one table: storage format, compute model, pricing model, concurrency model, where each wins. This table is a senior-interview cheat code and your position doc for architecture debates.
- **Day 90 · Sat · build** — **Deep Build — Cloud Warehouse Internals (Snowflake, BigQuery, MPP)**  
  [Block A] BigQuery sandbox (free, no card): load your food-delivery data; run identical queries against a partitioned+clustered version vs a flat version — compare **bytes scanned** (the honest metric) via dry-run API. Demonstrate `SELECT *` vs column selection cost difference. [Block B] Snowflake trial: same data; use `SYSTEM$CLUSTERING_INFORMATION` and query profile to observe micro-partition pruning kick in with a clustering key vs without. Screenshot query profiles — learn to read their operator trees (it's `EXPLAIN ANALYZE` in a suit). [Block C] Lab notes with both consoles' evidence.
- **Day 91 · Sun · consolidate** — **Consolidate — Cloud Warehouse Internals (Snowflake, BigQuery, MPP)**  
  [Block D] Write the comparison doc for real: same 5 queries, 3 systems (add local DuckDB as the "single-node vectorized" baseline — it will embarrass the clouds on small data, which is itself a lesson about when distributed is the wrong answer). +KN. [Block E] Vault note: "Separation of storage and compute — why every modern system converged here." [Block F] Drill: "Your BigQuery bill tripled this month. Investigation plan?" Plan Week 13.
  
  🎯 *Mastery:* Snowflake and Spark both prune data using min/max metadata. Explain where each stores that metadata and why Snowflake's version enables nearly-free time travel while Spark's alone doesn't.

## Week 14

- **Day 92 · Mon · theory** — **Columnar, mechanically**  
  Row storage = reading the whole cassette for one instrument; columnar = per-instrument tracks. Compression loves homogeneity: dictionary encoding, RLE, delta encoding, bit-packing — know what data shapes trigger each. Vectorized readers.
- **Day 93 · Tue · theory** — **Parquet anatomy**  
  File → row groups (~128MB targets) → column chunks → pages. Footer: schema + per-row-group min/max/null-count stats → **predicate pushdown** (skip row groups without reading them — connect to Week 7's Catalyst pushdown: Catalyst pushes the filter *to* the reader; Parquet stats let the reader skip). Dictionary + Bloom filters for point lookups. Why sorted data makes stats useful and random data makes them useless.
- **Day 94 · Wed · theory** — **The lakehouse problem**  
  Object stores can't atomically commit multiple files → readers see half-written data; no transactions, no schema enforcement, listing is slow. Delta's answer: `_delta_log/` — ordered JSON commits (add/remove file actions + stats) with periodic Parquet checkpoints; a reader's table state = replay the log. ACID via optimistic concurrency: writers attempt commit N+1; conflict → retry with conflict-detection rules.
- **Day 95 · Thu · theory** — **Delta mechanics**  
  MERGE under the hood (find touched files → rewrite them → commit swap — why merges on unpartitioned tables rewrite the world), deletion vectors (mark-don't-rewrite — the modern fix), OPTIMIZE + Z-ordering (multi-dimensional clustering so multiple filter columns all prune), VACUUM vs time-travel tension, schema evolution + enforcement.
- **Day 96 · Fri · theory** — **Iceberg contrast**  
  Snapshot → manifest-list → manifests → data files (metadata tree vs Delta's flat log). **Hidden partitioning**: partition by transform (`days(ts)`, `bucket(id, 16)`) with no partition column in queries — users can't "miss the partition filter," the perennial Hive/Delta footgun. Partition evolution without rewrite. The ecosystem politics: Iceberg as the neutral standard (Snowflake/BigQuery/AWS all speak it), Delta strongest inside Databricks; UniForm/interop as the peace treaty. Verdict you can defend.
- **Day 97 · Sat · build** — **Deep Build — Parquet + Lakehouse Internals (Delta & Iceberg)**  
  [Block A] Parquet dissection: write your fact table sorted by restaurant_id vs randomly ordered; use `pyarrow.parquet.ParquetFile.metadata` to print per-row-group min/max for the key column in both; run a selective Spark query against each and compare "bytes read" — watch stats-based skipping work and fail. This one experiment teaches more than a course. [Block B] Delta forensics: convert the table to Delta; run 5 operations (append, MERGE upsert, delete, OPTIMIZE, schema add-column); after each, read the newest `_delta_log` JSON *line by line* and narrate what it records. Time-travel to version 1 and diff row counts. Then two concurrent writers (two Spark sessions, conflicting MERGEs) → capture the ConcurrentModificationException and explain which conflict rule fired. [Block C] Commit the forensics walkthrough — `docs/delta-log-anatomy.md`.
- **Day 98 · Sun · consolidate** — **Consolidate — Parquet + Lakehouse Internals (Delta & Iceberg)**  
  [Block D] Iceberg parity pass with PyIceberg + DuckDB: same table, demonstrate hidden partitioning (query filters on raw timestamp, still prunes), inspect metadata JSON/avro tree. Write the Delta-vs-Iceberg verdict note with evidence. +KN. [Block E] Vault note: "What a lakehouse transaction actually is" — the optimistic-concurrency commit dance. [Block F] Drill: "Small-files problem: causes, costs, cures — in streaming ingestion specifically." Plan Week 14.
  
  🎯 *Mastery:* Two writers commit simultaneously to a Delta table — one appends, one runs OPTIMIZE. Does either fail? Which conflict rules decide, and why is append+append usually safe?

## Week 15

- **Day 99 · Mon · theory** — **Why orchestrators**  
  Cron = fire-and-forget alarm clock; orchestrator = air-traffic control (dependencies, retries, backfills, SLAs, lineage, alerting). The DAG as the contract. What "idempotent + retryable task" design means and why it's 80% of pipeline reliability.
- **Day 100 · Tue · theory** — **Dagster's asset model**  
  Software-defined assets: declare the *things that should exist* (tables, files, models); runs are derived from asset graphs. Why this beats task-first thinking for data (lineage is native, staleness is visible, backfills are asset-scoped). Ops/jobs vs assets — when each.
- **Day 101 · Wed · theory** — **Partitions + backfills**  
  Daily/hourly partition definitions, partition-aware assets, backfill semantics (materialize asset X for dates A–B), partition dependencies (today's asset needs yesterday's). This maps directly onto your SCD2/late-data knowledge.
- **Day 102 · Thu · theory** — **Resources, IO managers, sensors**  
  Dependency injection for pipelines (a Spark session / DB connection as a resource → swap for tests), IO managers (how asset outputs persist — the storage/compute seam), sensors (event-driven: new file lands → run) vs schedules, freshness policies + asset checks (data quality as first-class).
- **Day 103 · Fri · theory** — **Airflow fluency pass**  
  You need conversational competence: DAG files, operators, hooks, XCom (and its abuse), executors (Local/Celery/Kubernetes), scheduler mechanics, why Airflow backfills and dynamic DAGs hurt, TaskFlow API as the modernization. One-pager: "Dagster vs Airflow — my pick and the honest costs" (Airflow's ecosystem/hiring gravity is real; acknowledge it).
- **Day 104 · Sat · build** — **Deep Build — Orchestration (Dagster Deep + Airflow Fluency)**  
  [Block A] Dagsterize the capstone-so-far: assets for raw load → staged → SCD2 dims → fact, daily-partitioned, with resources for Spark/Postgres connections. Asset checks encoding your data-quality rules (row counts, null thresholds, FK integrity). [Block B] Run a 14-day backfill; then simulate a late-arriving source file for day −3 via a sensor and watch only the affected partition + downstream assets rematerialize. This demo — surgical backfill — is the whole argument for asset orchestration. [Block C] Commit; README gets the asset-graph screenshot.
- **Day 105 · Sun · consolidate** — **Consolidate — Orchestration (Dagster Deep + Airflow Fluency)**  
  [Block D] Failure-handling hardening: make one asset flaky (random 30% failure), configure retries + alerts (Dagster→Telegram, obviously — you have a fleet for this); verify a mid-backfill failure resumes without redoing finished partitions. +KN. [Block E] Vault note: "Idempotent pipeline design — the checklist" (deterministic outputs, delete-write or merge patterns, no side effects before commit points). [Block F] Drill: "Your 2 AM pipeline failed at step 7 of 12. Design the rerun story." Plan Week 15.
  
  🎯 *Mastery:* A backfill of 30 partitions fails on partition 17. What properties must your assets have so that resuming is safe, and where do naive pipelines violate them?

## Week 16

- **Day 106 · Mon · theory** — **dbt's actual job**  
  Software engineering applied to SQL transforms: version control, DAG via `ref()`, environments, tests, docs, CI. ELT's economics (cheap warehouse compute flipped ETL). What dbt is not (ingestion, orchestration — it's the T, and it's fine with that).
- **Day 107 · Tue · theory** — **Materializations deeply**  
  View / table / **incremental** / ephemeral; incremental strategies: append, merge, insert-overwrite, microbatch — map each to lakehouse mechanics you now understand (a dbt merge IS a Delta MERGE; you know what that rewrites). `is_incremental()` guards, lookback windows for late data (your watermark knowledge, materialized in SQL).
- **Day 108 · Wed · theory** — **Testing + contracts**  
  Generic tests (unique/not_null/relationships/accepted_values), singular tests, unit tests (dbt 1.8+), model **contracts** (enforced schemas — breaking-change protection), source freshness. The testing pyramid for data: schema contracts → column tests → business-rule tests → reconciliation tests.
- **Day 109 · Thu · theory** — **Jinja, macros, packages, snapshots**  
  DRY SQL via macros, dbt-utils, dbt-expectations. Snapshots = SCD2 as config — now compare honestly with your Week 6 hand-rolled version: what the abstraction handles (the happy path) and what it doesn't (your late-arriving-change edge case — verify this claim in the docs).
- **Day 110 · Fri · theory** — **Data quality as engineering**  
  Beyond dbt tests: expectation suites (Great Expectations / dbt-expectations), anomaly detection on metrics (volume, freshness, distribution drift), write-audit-publish pattern (stage → validate → swap — no bad data ever visible), data contracts between teams as the org-level fix. Where checks belong: ingestion edge vs transform layer vs consumption edge (answer: thin checks everywhere, deep checks at trust boundaries).
- **Day 111 · Sat · build** — **Deep Build — dbt + Data Quality Engineering**  
  [Block A] Rebuild the transform layer in dbt (DuckDB adapter for instant local dev): staging models → snapshots for SCD2 dims → incremental fact with merge strategy + 3-day lookback. Contracts on the marts. Tests at every layer including two singular business-rule tests ("no order has delivery before placement"). [Block B] CI: GitHub Actions running `dbt build` on PRs against a test schema, with a deliberate breaking change demonstrated getting caught by a contract. Implement write-audit-publish for the fact table (build to staging schema → asset check → swap). [Block C] `dbt docs generate` — screenshot the lineage graph into the README.
- **Day 112 · Sun · consolidate** — **Consolidate — dbt + Data Quality Engineering**  
  [Block D] The bake-off: feed your Week 6 edge cases (late-arriving change, early fact) through dbt snapshots — document exactly where the abstraction shines and where you'd fall back to custom SQL. Wire dbt into Dagster (dagster-dbt: dbt models as assets) — the orchestration + transform layers click together. +KN. [Block E] Vault note: "The data quality stack — what to check, where, and why." [Block F] Drill: "Design testing for a pipeline feeding financial reports." Plan capstone.
  
  🎯 *Mastery:* Your incremental model with a 3-day lookback still shows a discrepancy against a full-refresh rebuild. List the possible causes in order of likelihood.

## Week 17

- **Day 113 · Mon · theory** — **Why governance exists**  
  The three questions that appear the day a company has more than one team: who *owns* this data (accountability), can I *trust* it (quality + freshness contracts), may I *use* it (access + purpose limitation). Data mesh vs central platform as the two organizational answers — domains owning data-as-a-product with federated standards vs one platform team owning everything. Your Week 15 contracts were the technical half of this; governance is the organizational half.
- **Day 114 · Tue · theory** — **Catalogs and lineage**  
  What a catalog actually stores: technical metadata (schemas, partitions, stats), business metadata (owners, descriptions, tags, glossary), operational metadata (freshness, run history). The landscape: OpenMetadata/DataHub (open source), Unity Catalog (your Databricks home turf — study its three-level namespace and governance model), Purview (the Azure answer). Lineage: table-level vs column-level, and how it's *captured* — SQL parsing, orchestrator hooks, the OpenLineage standard (Dagster emits it natively; your stack is already fluent).
- **Day 115 · Wed · theory** — **Access control mechanics**  
  RBAC vs ABAC, grants in warehouses, row-level security and column masking (dynamic views vs native policies), the principle: govern at the *data* layer, not the dashboard layer, or every new tool re-litigates access. Unity Catalog's model as the worked example; Snowflake masking policies as the contrast.
- **Day 116 · Thu · theory** — **Privacy engineering**  
  PII classification (direct/indirect identifiers), GDPR + India's DPDP Act at working-knowledge level (you're building careers in both jurisdictions), retention policies, and the genuinely hard one: **right-to-erasure in an append-only lakehouse** — hard deletes in Delta (delete + VACUUM beyond retention... which kills time travel), deletion vectors, and crypto-shredding (encrypt per-user, delete the key) as the elegant escape hatch.
- **Day 117 · Fri · theory** — **Data products, SLAs, and cost**  
  A dataset becomes a product when it has an owner, a contract, an SLA, and a deprecation policy. Cost governance: who pays for the query (chargeback/showback), warehouse cost levers you already understand mechanically from Week 12 (bytes scanned, clustering, caching) reframed as governance policy. FinOps-lite for data teams.
- **Day 118 · Sat · build** — **Deep Build — Data Governance, Catalogs, Lineage & Privacy**  
  [Block A] Deploy OpenMetadata (Docker Compose) over `lakehouse-capstone`: ingest Postgres + dbt artifacts; watch lineage assemble itself from your dbt manifest; tag PII columns (customer name, address, phone) with classification tags; assign owners and descriptions to the marts. [Block B] Implement the controls: column masking on PII for a `analyst` role and a row-level filter (restaurant managers see only their restaurant) in the mart layer; prove both with two differently-privileged connections side by side. [Block C] Commit governance-as-code: the masking DDL, tag definitions, and an `OWNERS.md` per layer.
- **Day 119 · Sun · consolidate** — **Consolidate — Data Governance, Catalogs, Lineage & Privacy**  
  [Block D] The erasure drill: write and execute a runbook deleting one customer end-to-end — Bronze (append-only: tombstone + downstream filter), Silver/Gold (DELETE + deletion-vector inspection), the time-travel problem stated honestly (VACUUM retention vs audit needs), and where crypto-shredding would change the answer. This runbook is rare interview gold. [Block E] Vault note: "Right-to-erasure in a lakehouse — the mechanics nobody writes down." [Block F] Drill: "A regulator asks: show me everywhere customer X's data lives and prove you can delete it. Walk your answer." Plan the capstone.
  
  🎯 *Mastery:* Deleting a row from a Delta table doesn't remove it from storage. Enumerate every place the data still exists and the exact operation that removes each.

## Week 18

- **Day 120 · Mon · theory** — **Capstone slot 1/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) write the architecture decision records (ADRs) — one per day: (1) partition key strategy for Kafka topics, (2) Bronze/Silver/Gold contracts and what each layer guarantees, (3) watermark + late-data policy with DLQ, (4) SCD2 approach (snapshot vs custom) with edge-case policy, (5) orchestration triggers (sensor vs schedule per asset). Writing ADRs *before* building is the senior-engineer habit this capstone should install.
- **Day 121 · Tue · theory** — **Capstone slot 2/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) write the architecture decision records (ADRs) — one per day: (1) partition key strategy for Kafka topics, (2) Bronze/Silver/Gold contracts and what each layer guarantees, (3) watermark + late-data policy with DLQ, (4) SCD2 approach (snapshot vs custom) with edge-case policy, (5) orchestration triggers (sensor vs schedule per asset). Writing ADRs *before* building is the senior-engineer habit this capstone should install.
- **Day 122 · Wed · theory** — **Capstone slot 3/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) write the architecture decision records (ADRs) — one per day: (1) partition key strategy for Kafka topics, (2) Bronze/Silver/Gold contracts and what each layer guarantees, (3) watermark + late-data policy with DLQ, (4) SCD2 approach (snapshot vs custom) with edge-case policy, (5) orchestration triggers (sensor vs schedule per asset). Writing ADRs *before* building is the senior-engineer habit this capstone should install.
- **Day 123 · Thu · theory** — **Capstone slot 4/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) write the architecture decision records (ADRs) — one per day: (1) partition key strategy for Kafka topics, (2) Bronze/Silver/Gold contracts and what each layer guarantees, (3) watermark + late-data policy with DLQ, (4) SCD2 approach (snapshot vs custom) with edge-case policy, (5) orchestration triggers (sensor vs schedule per asset). Writing ADRs *before* building is the senior-engineer habit this capstone should install.
- **Day 124 · Fri · theory** — **Capstone slot 5/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) write the architecture decision records (ADRs) — one per day: (1) partition key strategy for Kafka topics, (2) Bronze/Silver/Gold contracts and what each layer guarantees, (3) watermark + late-data policy with DLQ, (4) SCD2 approach (snapshot vs custom) with edge-case policy, (5) orchestration triggers (sensor vs schedule per asset). Writing ADRs *before* building is the senior-engineer habit this capstone should install.
- **Day 125 · Sat · build** — **Deep Build — Phase 1 Capstone: The Lakehouse Platform**  
  [Sat A] Ingestion: event generator (with late events, duplicates, malformed records — the full zoo) → Kafka (idempotent producer, proper keys) → streaming Bronze (append-only, schema-on-read, checkpointed). [Sat B] Silver: dedup via watermark, validation (malformed → DLQ Delta table with rejection reason), foreachBatch MERGE. [Sat C] Kill/restart recovery drill on the whole chain; document.
- **Day 126 · Sun · consolidate** — **Consolidate — Phase 1 Capstone: The Lakehouse Platform**  
  [Sun D] Quality gates on Silver (asset checks: volume anomaly, null thresholds, freshness). +KN (final session — course should be done). [Sun E/F] ADR review against reality; adjust. Drill: narrate the Bronze→Silver design aloud in 5 minutes.

## Week 19

- **Day 127 · Mon · theory** — **Capstone slot 1/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) interview-prep mode — one Phase 1 mastery check per day, answered aloud and written.
- **Day 128 · Tue · theory** — **Capstone slot 2/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) interview-prep mode — one Phase 1 mastery check per day, answered aloud and written.
- **Day 129 · Wed · theory** — **Capstone slot 3/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) interview-prep mode — one Phase 1 mastery check per day, answered aloud and written.
- **Day 130 · Thu · theory** — **Capstone slot 4/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) interview-prep mode — one Phase 1 mastery check per day, answered aloud and written.
- **Day 131 · Fri · theory** — **Capstone slot 5/5 — Phase 1 Capstone: The Lakehouse Platform**  
  (One of five weekday slots this week.) interview-prep mode — one Phase 1 mastery check per day, answered aloud and written.
- **Day 132 · Sat · build** — **Deep Build — Phase 1 Capstone: The Lakehouse Platform**  
  [Sat A] Gold: dbt marts over Silver (star schema, snapshots, incremental facts, contracts), dagster-dbt integration — one asset graph from Kafka topic to mart. [Sat B] End-to-end cold-start run + a 7-day backfill + one surgical single-partition rerun. Fix everything that breaks. [Sat C] Performance pass: one documented Spark optimization with before/after Spark-UI evidence.
- **Day 133 · Sun · consolidate** — **Consolidate — Phase 1 Capstone: The Lakehouse Platform**  
  [Sun D] The narrative: architecture diagram (excalidraw), README that explains *why* at every arrow, blog post draft ("I built a lakehouse from Kafka to marts — here's what the tutorials skip"). [Sun E] Record a 15-minute walkthrough on your phone; watch it back; note every stumble. [Sun F] Phase 1 retrospective in the vault; plan Phase 2.

## Week 20

- **Day 134 · Mon · theory** — **Catch-up — finish an unfinished build**  
  Breather week, no new material. Go back to any build from the Data Engineering phase you left half-done or skipped and finish it properly — a working, documented artifact beats moving on with a hole in it. If everything's done, take your weakest build and harden it: tests, error handling, a README diagram.
- **Day 135 · Tue · theory** — **Re-answer the mastery checks, cold**  
  Re-answer the Weeks 5-18 mastery questions out loud, from memory, no notes. Each one you fumble marks a topic to re-read today. This is the honest audit — the whole point of the week is to find the soft spots while they're still cheap to fix.
- **Day 136 · Wed · theory** — **Re-read the one topic that's still fuzzy**  
  Pick the single concept from this stretch that still feels hand-wavy and re-read the primary source on it — the doc, the paper, the DDIA chapter, not a blog. Depth on one shaky idea now prevents a collapsed build later.
- **Day 137 · Thu · theory** — **Teach it back (vault note)**  
  Write one vault note explaining a concept from this stretch from memory, as if teaching a sharp junior. Writing from memory is the retention step; the gaps you hit while writing are precisely what you hadn't actually learned.
- **Day 138 · Fri · theory** — **Light day + Work Debrief**  
  Rest the brain — optional light reading only. Do the 15-minute Work Debrief: what broke at work this week, which roadmap topic explains it, what you'd do differently. Log it.
- **Day 139 · Sat · build** — **No new build — finish, or rest**  
  No new build this week. If a the Data Engineering phase build is unfinished, use this long block to take it end-to-end. If you're fully caught up: rest guilt-free, or refactor and document one prior build until it's portfolio-ready. Momentum is protected by rest, not spent by it.
- **Day 140 · Sun · consolidate** — **Consolidate the stretch**  
  Consolidate everything so far: skim your vault notes, confirm every Weeks 5-18 mastery check you can now answer cold, and jot the 2-3 threads still weakest — those become next week's morning warm-ups. Then stop. You've earned the reset.
  
  🎯 *Mastery:* Can you answer every Weeks 5-18 mastery check cold? List the ones you can't — that list is your real progress map.

## Week 21

- **Day 141 · Mon · theory** — **Probability that pays rent**  
  Random variables, expectation/variance, the distributions you'll actually meet (normal, binomial, Poisson, power-law — your restaurant popularity data *is* one), and the Central Limit Theorem from zero: means of anything become normal-ish, which is why confidence intervals work at all. The CLT is the load-bearing wall of all measurement.
- **Day 142 · Tue · theory** — **Estimation + the bootstrap**  
  Standard error (uncertainty of an estimate, not spread of data — the distinction that separates readers from users of statistics), confidence intervals honestly interpreted, and the bootstrap: resample your own data to get uncertainty for *any* statistic, no formulas required — the engineer's Swiss army knife, and 15 lines of NumPy.
- **Day 143 · Wed · theory** — **Hypothesis testing without the cargo cult**  
  What a p-value is (P(data this extreme | no effect)) and the three things it isn't (P(hypothesis), effect size, importance). Power and why underpowered tests produce exaggerated winners. Multiple comparisons — test 20 metrics, one "wins" by chance.
- **Day 144 · Thu · theory** — **A/B testing as a pipeline problem**  
  Randomization units (user vs session — and the interference between them), metric choice (guardrails vs success metrics), the peeking sin (checking daily and stopping at significance inflates false positives massively — you'll *demonstrate* this Saturday), CUPED variance reduction at awareness level. Note how much of this is data engineering: assignment logging, exposure events, metric pipelines — your home turf wearing a lab coat.
- **Day 145 · Fri · theory** — **Regression + the causation trap**  
  Linear/logistic regression as the workhorses, coefficients as adjusted effects, confounding (ice cream sales predict drowning), why observational "X drives Y" claims from dashboards are usually confounded, and the honest hierarchy: randomized experiment > natural experiment > regression with controls > vibes.
- **Day 146 · Sat · build** — **Deep Build — Statistics & Experimentation for Engineers**  
  [Block A] Bootstrap lab on food-delivery data: CI for median delivery time overall and per-city; then the peeking simulation — simulate 1,000 A/A tests (no true effect) with daily peeking-and-stopping vs fixed-horizon testing; plot false-positive rates (~5% vs ~25%+). One chart that permanently vaccinates you against peeking. [Block B] Run a proper simulated A/B: inject a true +3% effect into synthetic order data, compute required sample size for 80% power *first*, run to horizon, analyze with a t-test and a bootstrap CI, report effect size with uncertainty — the full ritual, done right once. [Block C] Commit `stats-labs` with both charts.
- **Day 147 · Sun · consolidate** — **Consolidate — Statistics & Experimentation for Engineers**  
  [Block D] Confounding demo: construct a synthetic dataset where a "promo" appears to hurt revenue until you control for city; show the sign flip with and without the confounder in the regression (Simpson's paradox, self-inflicted and therefore understood forever). [Block E] Vault note: "p-values, power, and peeking — the honest versions." [Block F] Drill: "PM says the new ranking model 'won the A/B by 2%, p=0.04, we peeked twice.' Your response?" Plan Week 20.
  
  🎯 *Mastery:* Why does peeking inflate false positives, mechanically — what property of the test statistic's random walk does early stopping exploit?

## Week 22

- **Day 148 · Mon · theory** — **The learning problem**  
  Generalization as the entire game: train/validation/test discipline, overfitting vs underfitting, bias-variance tradeoff with a drawn picture, why the test set is sacred (touch it twice and it's a validation set).
- **Day 149 · Tue · theory** — **Loss + gradient descent, mechanically**  
  Loss as a landscape, gradients as local slope, learning rate as step size (too big: bounce; too small: geologic time), SGD and mini-batches, momentum at intuition level. Implement GD by hand on 1-D linear regression in 20 lines — next week Karpathy assumes this and you'll have *built* it.
- **Day 150 · Wed · theory** — **Trees + ensembles: the tabular kings**  
  Decision trees (greedy splits, why they overfit alone), random forests (variance reduction via decorrelated voting), gradient boosting (each tree fixes the last one's residuals — XGBoost/LightGBM as the default winners on tabular data, still, in 2026). When deep learning is the *wrong* answer — most business tabular problems.
- **Day 151 · Thu · theory** — **Evaluation, properly**  
  Precision/recall/F1 and the threshold behind them, ROC-AUC vs PR-AUC (and why PR-AUC tells the truth under class imbalance), calibration (a 0.8 score should mean 80% — and usually doesn't), confusion-matrix fluency. This vocabulary is also your Week 25 RAG-eval vocabulary — one investment, two tracks.
- **Day 152 · Fri · theory** — **Feature engineering + leakage**  
  Leakage as the #1 real-world ML bug: future information smuggled into training. The killer connection to your DE mastery: **point-in-time correctness is leakage prevention** — your SCD2 Week 6 skills are literally feature-store engineering. Time-based splits for temporal data, target encoding's leak risk, train/serve skew.
- **Day 153 · Sat · build** — **Deep Build — Classical ML for Engineers**  
  [Block A] Predict late deliveries on your food-delivery data with XGBoost: proper *time-based* split, baseline (logistic regression) first, then boosted trees; evaluate with PR-AUC (make lateness rare so imbalance is real); calibration curve. [Block B] The leakage demo that teaches forever: add a subtly leaky feature (e.g., actual delivery duration, or a dimension attribute joined *as of today* instead of as-of order time), watch AUC jump to fantasy-land, then fix with a point-in-time join against your SCD2 dim and watch it fall to honest. Document the delta. [Block C] Commit `ml-labs`: model card (data window, split, metrics, known limitations) — the professional habit.
- **Day 154 · Sun · consolidate** — **Consolidate — Classical ML for Engineers**  
  [Block D] SHAP pass on the model (which features drive predictions — and which are proxies you should be suspicious of); sklearn Pipeline so preprocessing lives inside the artifact (train/serve skew, killed structurally). [Block E] Vault note: "Leakage and point-in-time joins — where ML bugs are really DE bugs." [Block F] Drill: "Model was 0.91 AUC offline, useless in production. List causes in order of likelihood." Plan Phase 2.
  
  🎯 *Mastery:* Why does a random split leak for temporal prediction problems even when no single feature is obviously 'future' data?

## Week 23

- **Day 155 · Mon · theory** — **Tokens and embeddings-as-lookup**  
  Tokenization (BPE: merge frequent pairs; why "hyderabad" might be 3 tokens and "the" is 1), vocabulary, the embedding matrix as a learned lookup table, positional information (learned positions → RoPE at intuition level: encode position as rotation so relative distance falls out of dot products).
- **Day 156 · Tue · theory** — **Attention, derived**  
  Q/K/V from zero: every token asks a question (Q), advertises what it holds (K), and carries content (V); attention score = how well a question matches an advertisement; output = content-weighted-by-match. The formula `softmax(QKᵀ/√d)V` piece by piece — including why √d (dot products grow with dimension; softmax saturates without the rescue). Watch Karpathy's "Let's build GPT" first hour.
- **Day 157 · Wed · theory** — **Multi-head + the block**  
  Multiple heads = multiple question-types asked in parallel (syntax head, coreference head — emergent, not designed). The transformer block: attention → residual add → norm → MLP (where most parameters live) → residual → norm. Residual connections as the gradient highway. Causal masking: why GPTs can't see the future.
- **Day 158 · Thu · theory** — **Training vs inference asymmetry**  
  Training: all positions predicted in parallel (teacher forcing). Inference: autoregressive, one token at a time — and the **KV cache** derived from first principles: past tokens' K,V never change, so cache them; each new token costs one Q against all cached K,V. Cache size math: layers × heads × head_dim × 2 × seq_len × bytes — compute it for a real model and be appropriately horrified. This derivation is the foundation of Week 29.
- **Day 159 · Fri · theory** — **Scale and consequences**  
  Prefill (parallel, compute-bound) vs decode (sequential, memory-bandwidth-bound) — why token generation speed is a bandwidth story, connecting directly to your Apple Silicon unified-memory research. Context window costs (attention is O(n²) in prefill; KV cache is O(n) in memory), sampling (temperature, top-p) mechanics.
- **Day 160 · Sat · build** — **Deep Build — Transformer Internals From Scratch**  
  [Block A+B] Follow Karpathy's "Let's build GPT" — type it yourself, no copy-paste — training a character-level GPT on a small corpus (use cricket commentary text if you can scrape some; make it yours). Target: training runs, loss falls, samples become less gibberish. Annotate every block of the code with your own comments explaining the *why*. [Block C] Commit as `gpt-from-scratch` with your annotations.
- **Day 161 · Sun · consolidate** — **Consolidate — Transformer Internals From Scratch**  
  [Block D] Extensions that cement understanding: (1) print the attention matrix for a sentence and visualize it as a heatmap — find a head doing something interpretable; (2) implement the KV cache in your inference loop and measure the speedup vs naive recompute; (3) play with temperature and watch determinism→chaos. [Block E] Vault note: "The KV cache, derived" — this note pays dividends for years. [Block F] Drill: "Why is generating token 1000 no slower than token 10 with a KV cache, and what resource is it consuming instead?" + DE drill. Plan Week 22.
  
  🎯 *Mastery:* For a 7B model with 32 layers, 32 heads, head_dim 128, fp16: how much KV cache does one 8K-token conversation hold, and what does that imply for batch serving?

## Week 24

- **Day 162 · Mon · theory** — **From word2vec to sentence embeddings**  
  The distributional hypothesis (meaning = company kept), word2vec's trick, then the jump: contextual embeddings (same word, different vector per context) and pooling token vectors into one sentence vector (CLS vs mean pooling — and why the model must be *trained* for the pooling you use).
- **Day 163 · Tue · theory** — **Contrastive training**  
  How bge/E5-class models learn: positive pairs pulled together, in-batch negatives pushed apart (InfoNCE loss intuition), **hard negatives** as the secret sauce (nearly-right answers teach discrimination; random negatives teach nothing), why batch size matters enormously here. Asymmetric instruction prefixes ("query: " / "passage: ") — the mechanism behind the rule you already follow with bge-small in DocMind.
- **Day 164 · Wed · theory** — **Geometry and its lies**  
  Cosine vs dot vs Euclidean (equivalent iff normalized), anisotropy (embeddings cluster in a cone — why raw cosine values compress into a narrow band and absolute thresholds like "0.8 = similar" are meaningless across models), dimensionality intuitions, Matryoshka embeddings (truncatable dimensions — train once, serve at many sizes).
- **Day 165 · Thu · theory** — **The practical zoo**  
  MTEB as the leaderboard (and its gaming), model selection axes: dimension, max sequence length, language coverage, license, latency. Chunking as embedding's shadow discipline: chunk size vs retrieval granularity, overlap, structure-aware chunking (headings, sentences) vs fixed windows — for your medical-PDF work this is not academic.
- **Day 166 · Fri · theory** — **Domain adaptation**  
  When general embeddings fail (jargon-heavy corpora — medical, legal), options ladder: better chunking → hybrid retrieval (next week's rescue) → fine-tuning the embedder (contrastive, needs labeled pairs or synthetic generation via LLM) → instruction-tuned rerankers. Costs of each rung.
- **Day 167 · Sat · build** — **Deep Build — Embeddings: Training, Geometry, Practice**  
  [Block A] Geometry lab on your own corpus (DocMind's docs): embed 1K chunks with bge-small; (1) plot the cosine-similarity distribution of random pairs — witness anisotropy (the histogram won't center at 0); (2) demonstrate the prefix effect: same queries with and without "query: ", measure retrieval hit-rate difference; (3) UMAP the embeddings colored by document — see the cluster structure. [Block B] Chunking bake-off: three strategies (fixed-512, fixed-with-overlap, structure-aware by headings) → same 20 test queries → recall@5 comparison table. Pick a winner with evidence. [Block C] Commit lab + update DocMind's chunking if the evidence demands it.
- **Day 168 · Sun · consolidate** — **Consolidate — Embeddings: Training, Geometry, Practice**  
  [Block D] Mini fine-tune experiment: generate 200 synthetic (query, passage) pairs from your corpus with an LLM, fine-tune bge-small with sentence-transformers for a few epochs, measure before/after recall on a held-out set. Even if gains are modest, you'll have *done* it — most AI engineers never have. [Block E] Vault note: "Why cosine 0.83 means nothing without context — embedding geometry honestly." [Block F] Drill: "Retrieval is bad on medical abbreviations. Diagnose and fix, cheapest option first." + DE drill. Plan Week 23.
  
  🎯 *Mastery:* Why do in-batch negatives make large batch sizes disproportionately valuable in contrastive training, and what problem do hard negatives solve that batch size can't?

## Week 25

- **Day 169 · Mon · theory** — **The ANN problem**  
  Exact k-NN is O(n·d) per query — dead at scale. The recall/latency/memory triangle: every index is a point in it. Brute force as the honest baseline (and correct answer under ~100K vectors — knowing when NOT to use an ANN index is mastery too).
- **Day 170 · Tue · theory** — **HNSW I: the idea**  
  Skip lists → navigable small worlds: express lanes (sparse upper layers, long hops) over local streets (dense bottom layer, short hops). Search = greedy descent: enter at top, hop toward the query, drop a layer, repeat; bottom layer does beam search of width efSearch.
- **Day 171 · Wed · theory** — **HNSW II: construction + parameters**  
  Insertion: probabilistic layer assignment (exponentially fewer nodes per layer up), connect to M nearest with heuristic edge selection (diversity over pure proximity — why this prevents cluster-trapping). M (memory + recall), efConstruction (build quality/time), efSearch (query recall/latency). Deletes as HNSW's weak spot (tombstones, index decay, rebuild strategies).
- **Day 172 · Thu · theory** — **IVF + PQ**  
  IVF: k-means the space into cells; search only nprobe nearest cells (coarse pruning). Product quantization: split vector into m subvectors, k-means each subspace, store centroid IDs — 768-dim fp32 (3KB) → 64 bytes; distance via lookup tables. IVF-PQ as the billion-scale workhorse; re-ranking with full vectors to claw back accuracy. When HNSW (RAM-resident, <100M, best recall/latency) vs IVF-PQ (memory-bound, massive scale).
- **Day 173 · Fri · theory** — **The database around the index**  
  What Qdrant/pgvector/etc. add: filtered search (the hard problem — pre-filter kills graph connectivity, post-filter kills recall; payload-aware indexing as Qdrant's answer), quantization tiers, replication/sharding, hybrid API. pgvector's honest positioning: your data's already in Postgres and scale is modest → simplicity wins.
- **Day 174 · Sat · build** — **Deep Build — Vector Search Internals (HNSW, IVF, PQ)**  
  [Block A] Benchmark harness (this becomes a portfolio piece): 1M synthetic vectors (768-dim) in Qdrant; measure recall@10 (vs brute-force ground truth on a 1K-query sample) and p95 latency across efSearch ∈ {16, 64, 256} and M ∈ {8, 16, 32}. Plot the recall-latency frontier with matplotlib. [Block B] Filtered-search pathology: add a payload field with 1% selectivity; compare filtered query performance and recall vs unfiltered — observe the problem, read Qdrant's docs on how it mitigates, verify. [Block C] Commit `ann-bench` repo with plots.
- **Day 175 · Sun · consolidate** — **Consolidate — Vector Search Internals (HNSW, IVF, PQ)**  
  [Block D] Quantization tier test: scalar-quantize the collection (int8), re-measure recall/latency/memory — the triangle made concrete. Then the humility test: brute force over 50K vectors vs HNSW — measure where the crossover actually is on your hardware. [Block E] Vault note: "HNSW from skip lists up — with the parameter cheat sheet." [Block F] Drill: "Design vector search for 500M embeddings on a budget." + DE drill. Plan Week 24.
  
  🎯 *Mastery:* Why does HNSW's edge-selection heuristic sometimes choose a *farther* neighbor over a nearer one during construction, and what failure does that prevent at query time?

## Week 26

- **Day 176 · Mon · theory** — **Why dense-only fails**  
  Vocabulary mismatch is dense's win; exact-match (error codes, SKUs, names, rare jargon) is its loss — the embedding smooths away the very specificity you need. Lexical and dense as fielders covering different regions. Failure taxonomy: build one from DocMind's actual missed queries.
- **Day 177 · Tue · theory** — **BM25 from first principles**  
  TF-IDF → BM25's two fixes: term-frequency saturation (k1 — the 10th occurrence matters less than the 2nd) and length normalization (b). The formula, term by term. Its blind spot (synonymy) and its superpower (exactness, zero training).
- **Day 178 · Wed · theory** — **Learned sparse: SPLADE**  
  A transformer that outputs weighted *vocabulary terms* (with expansion: "laptop" activates "notebook", "computer") — lexical precision + learned semantics, served from an inverted index. Cost: indexing compute, index size inflation. uniCOIL/docT5query as the family.
- **Day 179 · Thu · theory** — **Fusion + late interaction**  
  RRF: rank-based fusion, score-scale-free, k=60, embarrassingly hard to beat — hand-compute one example. ColBERT: per-token embeddings, MaxSim late interaction (each query token finds its best document token) — a middle path between bi-encoder speed and cross-encoder accuracy, at 100x storage. PLAID as the compression answer.
- **Day 180 · Fri · theory** — **Cross-encoder reranking**  
  Bi-encoder (separate towers, similarity in vector space, fast, approximate) vs cross-encoder (query+doc jointly attended, every token sees every token, slow, accurate). The two-stage pattern: cheap wide net (top-100) → expensive selector picks the XI (top-10). Score calibration, latency budgets, when to skip reranking (already-precise queries; latency-critical paths).
- **Day 181 · Sat · build** — **Deep Build — Retrieval Beyond Cosine (Hybrid, SPLADE, ColBERT, Rerankers)**  
  [Block A] Implement toy BM25 in ~50 lines of pure Python (no libraries) — validate against rank_bm25 on 100 docs. Owning the formula beats citing it. [Block B] DocMind surgery: add real BM25 (or Qdrant's sparse vectors) alongside dense → RRF fusion → bge-reranker cross-encoder on top-50. Architecture: three-stage pipeline with per-stage latency logging. [Block C] Commit; update the architecture diagram.
- **Day 182 · Sun · consolidate** — **Consolidate — Retrieval Beyond Cosine (Hybrid, SPLADE, ColBERT, Rerankers)**  
  [Block D] The measurement that makes it real: 40 hand-labeled queries (mix: semantic paraphrases, exact-term lookups, multi-hop) → recall@10 and MRR for dense-only vs BM25-only vs hybrid-RRF vs hybrid+rerank. Four-row table. This table goes on your resume in disguise ("improved retrieval recall by X%"). [Block E] Vault note: "The retrieval quality ladder — what each rung costs and buys." [Block F] Drill: "Users search error codes and get vibes-based results. Fix the pipeline." + DE drill. Plan Week 25.
  
  🎯 *Mastery:* Why is RRF robust to one retriever's score distribution being garbage, while weighted score fusion isn't?

## Week 27

- **Day 183 · Mon · theory** — **Attention & multi-head — second pass**  
  Re-derive attention from scratch on paper: QKᵀ/√d, softmax, the weighted sum; then multi-head as parallel question-types. Re-implement single-head attention in ~20 lines of numpy without looking. If you can't rebuild it from memory, you didn't own it the first time — now you will.
- **Day 184 · Tue · theory** — **Embeddings geometry — second pass**  
  Re-derive why cosine vs dot vs Euclidean differ, why normalization matters, and how contrastive loss with in-batch negatives shapes the space. Sketch the geometry; recompute a tiny similarity example by hand.
- **Day 185 · Wed · theory** — **Vector-index internals — second pass**  
  Re-walk HNSW graph construction and greedy search, and the IVF/PQ trade-offs. Recompute recall@k on a small example by hand. Understand WHY the edge-selection heuristic sometimes keeps a farther neighbour over a nearer one.
- **Day 186 · Thu · theory** — **KV-cache & inference math — second pass**  
  Recompute KV-cache size for a 7B model at 8K tokens from scratch, then the arithmetic-intensity argument for why batching multiplies decode throughput but barely moves per-token latency. This is the math behind every serving-cost decision.
- **Day 187 · Fri · theory** — **Retrieval evaluation — second pass + Work Debrief**  
  Recompute recall@k, MRR and nDCG by hand on a 5-query example until it's mechanical. Design one eval slice you'd add to your own RAG. Then the 15-minute Work Debrief, logged.
- **Day 188 · Sat · build** — **Re-implement from memory (don't re-read)**  
  Rebuild, don't revise. In one sitting: a minimal transformer block (attention + MLP + residual + norm) in ~100 lines, and a brute-force or tiny-HNSW ANN index. Diff your result against your Week 21/23 builds — the gaps are your real syllabus.
- **Day 189 · Sun · consolidate** — **Consolidate AI internals**  
  Re-answer every Weeks 19-24 mastery check cold. Any that's shaky becomes next week's morning warm-up. The AI phase gets harder from here — this second pass is what makes the back half land instead of blur.
  
  🎯 *Mastery:* Rebuild single-head attention and compute a 7B model's 8K-token KV-cache size — both from memory, no notes. If either stalls, you found this week's win.

## Week 28

- **Day 190 · Mon · theory** — **Why evals separate professionals from demo-builders**  
  Vibes-based iteration = changing your batting stance every ball without watching replays. The eval hierarchy: retrieval metrics → generation metrics → end-to-end task success → online metrics. Golden datasets as the foundation everything rests on.
- **Day 191 · Tue · theory** — **Retrieval metrics, by hand**  
  Recall@k, precision@k, MRR, nDCG (graded relevance, log-discounted) — compute each on a paper example of 5 queries until mechanical. What each rewards/misses (recall ignores rank order below k; MRR only sees the first hit; nDCG needs graded labels you probably don't have).
- **Day 192 · Wed · theory** — **Generation metrics + LLM-as-judge**  
  Faithfulness (grounded in retrieved context?), answer relevance, context precision/recall. LLM-as-judge honestly: position bias, verbosity bias, self-preference, score clustering; mitigations (pairwise over absolute, order randomization, rubric anchoring, a stronger judge than the judged). Never trust a metric whose prompt you haven't read.
- **Day 193 · Thu · theory** — **Golden dataset construction**  
  The taxonomy your set must cover: easy lookups, paraphrases, exact-term queries, multi-hop, ambiguous, and **unanswerable** (the "should say I don't know" class — where most RAG systems embarrass themselves). Synthetic generation via LLM + human curation; size honesty (50 curated beats 500 sloppy); versioning the dataset like code.
- **Day 194 · Fri · theory** — **Evals as infrastructure**  
  Eval-in-CI (quality gates on PRs), regression tracking over time, slice analysis (metrics per query type — aggregates hide failures), online evals (implicit feedback, A/B), and the LLMOps framing: evals are to AI systems what tests are to software, except flakier and more expensive — design accordingly (caching, sampling, thresholds with tolerance bands).
- **Day 195 · Sat · build** — **Deep Build — Evaluation Engineering (The Differentiator)**  
  [Block A] Golden dataset for DocMind: 100 examples across the full taxonomy (including 15 unanswerables), stored as versioned JSONL with rationales. This is tedious. Do it anyway — it's the most valuable artifact in Phase 2. [Block B] Eval harness as code: pytest-style runner — retrieval scoring (recall@10, MRR from your labeled sources) + generation scoring (RAGAS faithfulness/relevance, having read RAGAS's prompts first) → scorecard JSON + slice breakdown by query type. [Block C] Commit `docmind-evals`; run against Week 24's four configurations — now the ladder has *numbers*.
- **Day 196 · Sun · consolidate** — **Consolidate — Evaluation Engineering (The Differentiator)**  
  [Block D] Judge-audit session: take 20 judge scores, manually agree/disagree with each, compute your agreement rate with the judge — if it's below ~80%, fix the rubric and rerun. Most people skip this; skipping it makes every downstream number decorative. [Block E] Vault note: "How I'd know my RAG system got worse" — the regression-detection design. [Block F] Drill: "Your faithfulness score is 0.92. What might still be badly wrong?" + DE drill. Plan Week 26.
  
  🎯 *Mastery:* Aggregate recall@10 improved 5% but the unanswerable-query slice regressed. What probably happened in your retrieval change, and which metric would have caught it earlier?

## Week 29

- **Day 197 · Mon · theory** — **Query transformation**  
  The user's query is rarely the best retrieval query: rewriting (decontextualize follow-ups using chat history), expansion (HyDE: hallucinate a hypothetical answer, embed *that* — why it works: answers live nearer to passages than questions do), decomposition (multi-hop → sub-queries). Cost: every transform adds an LLM call to your latency budget.
- **Day 198 · Tue · theory** — **Routing + adaptive retrieval**  
  Not every query deserves the same pipeline: classification routing (chitchat → no retrieval; exact-lookup → BM25-heavy; analytical → decompose), self-RAG/CRAG intuitions (retrieve → grade relevance → retry or answer), your QueryGenie already routes SQL-vs-semantic — generalize that instinct.
- **Day 199 · Wed · theory** — **Multi-hop + iterative retrieval**  
  Questions whose answer needs chained lookups ("who managed the team that won X in year Y"); iterative retrieve→read→retrieve loops, the compounding-error problem, when an agent loop is justified vs a fixed two-hop pipeline (usually the latter).
- **Day 200 · Thu · theory** — **GraphRAG (your graph-extraction interest cashes in)**  
  Entity/relation extraction via LLM → knowledge graph → retrieval by graph traversal + community summaries (hierarchical summarization of graph clusters). Where it wins: global questions ("what are the main themes across this corpus") that chunk-retrieval structurally cannot answer. Costs: extraction is expensive, schema drift (your Cypher MERGE + provenance thinking applies directly), staleness. Honest verdict: powerful for specific shapes, oversold as a default.
- **Day 201 · Fri · theory** — **Context engineering**  
  What actually goes in the window: ordering effects (lost-in-the-middle), context compression (LLMLingua-style), citation formats that enable verifiable answers (DocMind's Provenance dataclass is ahead of the curve here — formalize it), structured outputs for downstream parsing.
- **Day 202 · Sat · build** — **Deep Build — Advanced RAG (Query Understanding, Multi-hop, GraphRAG)**  
  [Block A] Add query understanding to DocMind: a router (small/fast LLM call) classifying query type → conditional pipeline (skip retrieval / BM25-weighted / decompose-then-retrieve). Log routing decisions. [Block B] Implement HyDE and query decomposition as toggleable stages; eval-harness comparison: baseline vs +HyDE vs +decomposition on your golden set, sliced by query type (this is where slicing pays: HyDE should help paraphrase queries and do nothing—or harm—exact lookups). [Block C] Commit with the sliced results table.
- **Day 203 · Sun · consolidate** — **Consolidate — Advanced RAG (Query Understanding, Multi-hop, GraphRAG)**  
  [Block D] GraphRAG spike (timeboxed 2.5h): extract entities/relations from 50 DocMind chunks with an LLM into NetworkX (skip Neo4j ops for now — the concept is the point), implement one community-summary retrieval, answer one "global" question chunk-RAG fails at. Write the honest verdict: what it cost, what it bought. [Block E] Vault note: "Query understanding: the decision tree in front of my retriever." [Block F] Drill: "A user asks a follow-up question with a pronoun. Trace it through your pipeline." + DE drill. Plan Week 27.
  
  🎯 *Mastery:* Why does HyDE improve recall for paraphrase-style queries but risk degrading exact-term queries, mechanically?

## Week 30

- **Day 204 · Mon · theory** — **Agents from zero**  
  LLM + tools + memory + a loop (observe→think→act). Workflows (fixed steps, predictable) vs agents (dynamic steps, flexible, error-compounding) — Anthropic's "Building Effective Agents" is the reading; internalize its bias toward simplicity. The augmented-LLM building blocks: retrieval, tools, memory.
- **Day 205 · Tue · theory** — **Tool use mechanics**  
  Function schemas, the model emits structured calls, *your* runtime executes and returns results into context — a JSON protocol with an LLM choosing arguments; no magic. Tool design as API design: descriptions are prompts, error messages are prompts, return values are prompts. Parallel tool calls, tool-choice forcing.
- **Day 206 · Wed · theory** — **MCP architecture**  
  Client-host-server model; servers expose tools/resources/prompts over a standard protocol (the USB-C framing); transports (stdio, HTTP). You've consumed MCP via Claudian — now read the spec's architecture page and understand what the Claudian plugin is actually doing to your vault.
- **Day 207 · Thu · theory** — **Failure modes + hardening**  
  Infinite loops (max iterations), tool hallucination (strict schemas, validation), context exhaustion (summarization, pruning), compounding errors (checkpoints, human-in-the-loop gates), prompt injection via tool results (treat tool output as untrusted input — the security frame most agent tutorials skip entirely).
- **Day 208 · Fri · theory** — **Multi-agent patterns + judgment**  
  Orchestrator-workers, evaluator-optimizer, when parallelism genuinely helps (independent subtasks) vs resume-driven engineering. Cost/latency accounting: an agent that makes 15 LLM calls has 15x the cost and compounding latency — the production question is always "what's the simplest system that meets the bar."
- **Day 209 · Sat · build** — **Deep Build — Agents & MCP (Engineering, Not Hype)**  
  [Block A] Build an MCP server (FastMCP, Python) over your lakehouse: tools `query_gold_mart(sql)` (read-only, validated), `get_pipeline_status()` (Dagster GraphQL), `get_data_freshness(table)`. Wire into Claude Desktop — your DE and AI tracks shaking hands. [Block B] Harden it: SQL validation (reject writes, enforce LIMIT), auth token, structured errors designed to help the LLM self-correct (bad error messages → agent flailing; good ones → recovery). Test with deliberately malicious/confused prompts. [Block C] Commit `lakehouse-mcp`; document the tool-design decisions.
- **Day 210 · Sun · consolidate** — **Consolidate — Agents & MCP (Engineering, Not Hype)**  
  [Block D] Build one small evaluator-optimizer loop: agent drafts SQL from a question → executes → checks result shape → retries on error, max 3 iterations, full trace logged. Measure success rate on 20 questions vs single-shot. This is QueryGenie's pattern, matured. [Block E] Vault note: "Agent vs workflow — my decision checklist" + "Tool design is prompt design." [Block F] Drill: "Your agent occasionally loops forever calling the same tool. Root causes and fixes." + DE drill. Plan Week 28.
  
  🎯 *Mastery:* Why must tool *results* be treated as untrusted input even when your tools are trusted, and what's one concrete exploit this prevents?

## Week 31

- **Day 211 · Mon · theory** — **The decision landscape**  
  Prompting → RAG → fine-tuning, ascending cost and commitment. Fine-tuning changes behavior/style/format/skill; RAG changes knowledge. "RAG for facts, fine-tuning for form." When FT genuinely wins: consistent structured output, domain style, latency (shorter prompts), small-model specialization to replace a big model on a narrow task (the economically interesting case).
- **Day 212 · Tue · theory** — **Full FT vs PEFT; LoRA derived**  
  Why updating 7B params needs cluster hardware (optimizer states: Adam holds 2 extra copies — 3–4x model size in memory). LoRA's insight: weight *updates* live in a low-rank subspace → freeze W, learn ΔW = BA (B: d×r, A: r×d, r≪d) — 7B model, <1% trainable params. Rank r, alpha scaling, which modules to target (attention projections vs all-linear), merging adapters at inference (zero latency tax).
- **Day 213 · Wed · theory** — **QLoRA's three tricks**  
  4-bit NF4 quantization of the frozen base (information-theoretically motivated bucket placement for normal-ish weights), double quantization (quantize the quantization constants), paged optimizers (spill optimizer state to CPU on spikes). Net: 7B fine-tuning on a single consumer GPU. Know each trick at "explain the idea" depth.
- **Day 214 · Thu · theory** — **Data is the whole game**  
  Instruction formats and chat templates (wrong template = silently broken model — the #1 practical failure), quality >> quantity (hundreds of curated beat thousands of scraped), synthetic data generation + filtering, train/val splits that respect duplicates, loss masking (train on completions, not prompts).
- **Day 215 · Fri · theory** — **Evaluation + failure modes**  
  Val loss is necessary, insufficient — task evals (Week 25 harness thinking) are the truth. Catastrophic forgetting (the model gets your task, loses general ability — measure both), overfitting signatures, when to stop. RLHF/DPO at awareness level: preference optimization as the layer above SFT.
- **Day 216 · Sat · build** — **Deep Build — Fine-Tuning (LoRA/QLoRA, Properly)**  
  [Block A] The real run: QLoRA fine-tune Qwen2.5-1.5B-Instruct on a structured-extraction task from your medical-PDF domain — 400 synthetic examples (generate with a strong LLM from your actual document patterns, then hand-filter the worst 20%). Colab/Kaggle free GPU or a couple of dollars of RunPod. Correct chat template, completion-only loss, val split. [Block B] Evaluate like Week 25 taught you: 40 held-out examples, exact-match + field-level F1, base vs tuned, plus 10 general-ability probes to check forgetting. Results table. [Block C] Commit `qlora-extraction` with the full recipe reproducible.
- **Day 217 · Sun · consolidate** — **Consolidate — Fine-Tuning (LoRA/QLoRA, Properly)**  
  [Block D] Ablation (timeboxed): rerun at r=4 vs r=16 (or 200 vs 400 examples) — one variable, measured. Ablation discipline is what separates engineers from tutorial-followers. [Block E] Vault note: "When I'd actually recommend fine-tuning" — now with your own evidence attached. [Block F] Drill: "PM wants to fine-tune on the company wiki so the model 'knows our docs.' Respond." + DE drill. Plan Week 29.
  
  🎯 *Mastery:* Why does LoRA's low-rank hypothesis hold for fine-tuning *updates* when full weight matrices clearly aren't low-rank?

## Week 32

- **Day 218 · Mon · theory** — **The two phases, quantified**  
  Prefill: all prompt tokens in parallel — compute-bound (FLOPs). Decode: one token at a time, each requiring a full pass reading all weights + KV cache — **memory-bandwidth-bound**. The arithmetic-intensity argument: decode reads GBs to produce one token; your tokens/sec ceiling ≈ bandwidth ÷ bytes-read-per-token. Now your Apple Silicon unified-memory research has a formula under it — compute the theoretical ceiling for a machine you know.
- **Day 219 · Tue · theory** — **KV cache economics + PagedAttention**  
  Week 21's cache math at serving scale: batch × seq_len × cache-per-token = the real capacity limit (weights are fixed; cache grows). Naive allocators fragment (reserve max-length per request). vLLM's PagedAttention: virtual memory for the KV cache — fixed-size blocks, logical→physical mapping, near-zero fragmentation, prefix sharing via copy-on-write (Week 1's OS concepts, verbatim, applied to attention). This is why vLLM wins.
- **Day 220 · Wed · theory** — **Batching + scheduling**  
  Static batching (wait, batch, run — latency tax, drain bubbles) vs **continuous batching** (new requests join at any decode step; finished ones leave — the innovation that multiplied GPU utilization). Chunked prefill (interleave prefill chunks with decodes so long prompts don't stall everyone). Metrics that matter: TTFT, ITL/TPOT, goodput under SLO.
- **Day 221 · Thu · theory** — **Quantization for inference**  
  The ladder: FP16 → INT8 → INT4; weight-only quantization (weights compressed, compute in fp16 — attacks the bandwidth bound directly, which is why INT4 speeds up decode). Formats: GGUF (llama.cpp — CPU/Metal, your Linux/Mac-adjacent world), AWQ (activation-aware: protect the salient 1% of weights), GPTQ. Quality measurement: perplexity deltas + task evals (Week 25, again — it's always Week 25).
- **Day 222 · Fri · theory** — **The deployment decision tree**  
  API (zero ops, per-token cost, data leaves) vs self-hosted vLLM (GPU ops, fixed cost, control) vs edge llama.cpp (privacy, latency, capability ceiling). Speculative decoding (small drafter, big verifier — spend cheap FLOPs to save expensive bandwidth) as the elegant closer. Write the opinionated one-pager with cost math for a concrete workload (e.g., DocMind at 10K queries/day).
- **Day 223 · Sat · build** — **Deep Build — Inference & Serving (vLLM, Quantization, the Hardware Story)**  
  [Block A] Serve Qwen2.5-1.5B via llama.cpp (GGUF): Q8 vs Q4_K_M — measure TTFT and tokens/sec at context lengths 512 vs 4096; verify the decode-speed gain from Q4 and connect it to the bandwidth argument with arithmetic. [Block B] vLLM session (GPU rental, a few dollars, or Kaggle GPU): same model, throughput at concurrency 1 vs 8 vs 32 — witness continuous batching's throughput scaling and the ITL cost it charges. One chart: throughput vs concurrency, annotated. [Block C] Commit `inference-bench` with charts + the cost one-pager.
- **Day 224 · Sun · consolidate** — **Consolidate — Inference & Serving (vLLM, Quantization, the Hardware Story)**  
  [Block D] Quality check the quants: run 30 golden-set queries through Q8 vs Q4 behind DocMind — eval-harness scores side by side. Quantize nothing you haven't measured. [Block E] Vault note: "Why decode speed is a memory-bandwidth story" — with your measured numbers vs theoretical ceilings. [Block F] Drill: "10x traffic tomorrow, same GPU budget. Your levers, in order." + DE drill. Plan capstone.
  
  🎯 *Mastery:* Batch size 1→8 barely changes decode latency per token but multiplies throughput ~8x. Explain via arithmetic intensity — what resource was idle at batch 1?

## Week 33

- **Day 225 · Mon · theory** — **Capstone slot 1/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) ADRs again, one per day: (1) retrieval pipeline final architecture (router → hybrid → rerank), (2) eval gates and thresholds (which metrics block a deploy), (3) observability design (traces, per-stage latency, cost per query), (4) model serving choice with cost math, (5) degradation ladder (reranker down → dense-only flagged; LLM down → retrieval-only with citations).
- **Day 226 · Tue · theory** — **Capstone slot 2/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) ADRs again, one per day: (1) retrieval pipeline final architecture (router → hybrid → rerank), (2) eval gates and thresholds (which metrics block a deploy), (3) observability design (traces, per-stage latency, cost per query), (4) model serving choice with cost math, (5) degradation ladder (reranker down → dense-only flagged; LLM down → retrieval-only with citations).
- **Day 227 · Wed · theory** — **Capstone slot 3/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) ADRs again, one per day: (1) retrieval pipeline final architecture (router → hybrid → rerank), (2) eval gates and thresholds (which metrics block a deploy), (3) observability design (traces, per-stage latency, cost per query), (4) model serving choice with cost math, (5) degradation ladder (reranker down → dense-only flagged; LLM down → retrieval-only with citations).
- **Day 228 · Thu · theory** — **Capstone slot 4/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) ADRs again, one per day: (1) retrieval pipeline final architecture (router → hybrid → rerank), (2) eval gates and thresholds (which metrics block a deploy), (3) observability design (traces, per-stage latency, cost per query), (4) model serving choice with cost math, (5) degradation ladder (reranker down → dense-only flagged; LLM down → retrieval-only with citations).
- **Day 229 · Fri · theory** — **Capstone slot 5/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) ADRs again, one per day: (1) retrieval pipeline final architecture (router → hybrid → rerank), (2) eval gates and thresholds (which metrics block a deploy), (3) observability design (traces, per-stage latency, cost per query), (4) model serving choice with cost math, (5) degradation ladder (reranker down → dense-only flagged; LLM down → retrieval-only with citations).
- **Day 230 · Sat · build** — **Deep Build — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  [Sat A] Wire the eval harness into GitHub Actions: PRs run the golden set; recall@10, MRR, faithfulness below thresholds → red X. Cache aggressively (embeddings, judge calls) to keep CI under 10 minutes. [Sat B] Tracing: Langfuse (or OTel) instrumentation — every query logs router decision, retrieval hits, rerank scores, per-stage latency, token costs. [Sat C] Chaos hour: adversarial queries (injections, gibberish, 10K-token pastes, unanswerables) — fix the three worst behaviors.
- **Day 231 · Sun · consolidate** — **Consolidate — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  [Sun D] Serving integration: local quantized model as a DocMind backend option (config-switchable API vs local); measure the quality/cost/latency triangle across both with the harness. [Sun E/F] ADR-vs-reality review; DE drill; plan week 31.

## Week 34

- **Day 232 · Mon · theory** — **Capstone slot 1/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) one Phase 2 mastery check per day, aloud + written.
- **Day 233 · Tue · theory** — **Capstone slot 2/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) one Phase 2 mastery check per day, aloud + written.
- **Day 234 · Wed · theory** — **Capstone slot 3/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) one Phase 2 mastery check per day, aloud + written.
- **Day 235 · Thu · theory** — **Capstone slot 4/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) one Phase 2 mastery check per day, aloud + written.
- **Day 236 · Fri · theory** — **Capstone slot 5/5 — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  (One of five weekday slots this week.) one Phase 2 mastery check per day, aloud + written.
- **Day 237 · Sat · build** — **Deep Build — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  [Sat A] Production posture: timeouts, retries with backoff, the degradation ladder implemented and *tested* (kill Qdrant → verify graceful response), `/metrics` endpoint (Prometheus format — Phase 3 will scrape it). [Sat B] Load test (locust): find the bottleneck, fix one thing, document before/after. [Sat C] Multi-tenant seam pressure test (you built the seam — prove isolation with two tenants' data).
- **Day 238 · Sun · consolidate** — **Consolidate — Phase 2 Capstone: DocMind v2, Eval-Gated and Served**  
  [Sun D] Narrative: architecture doc, eval scorecard tables in the README (the Week 24 ladder + judge-audit + quant comparison), blog post: "I added evals to my RAG system and here's what broke." [Sun E] 15-minute recorded walkthrough; watch; note stumbles. [Sun F] Phase 2 retrospective; plan Phase 3.

## Week 35

- **Day 239 · Mon · theory** — **Catch-up — finish an unfinished build**  
  Breather week, no new material. Go back to any build from the AI Engineering phase you left half-done or skipped and finish it properly — a working, documented artifact beats moving on with a hole in it. If everything's done, take your weakest build and harden it: tests, error handling, a README diagram.
- **Day 240 · Tue · theory** — **Re-answer the mastery checks, cold**  
  Re-answer the Weeks 19-31 mastery questions out loud, from memory, no notes. Each one you fumble marks a topic to re-read today. This is the honest audit — the whole point of the week is to find the soft spots while they're still cheap to fix.
- **Day 241 · Wed · theory** — **Re-read the one topic that's still fuzzy**  
  Pick the single concept from this stretch that still feels hand-wavy and re-read the primary source on it — the doc, the paper, the DDIA chapter, not a blog. Depth on one shaky idea now prevents a collapsed build later.
- **Day 242 · Thu · theory** — **Teach it back (vault note)**  
  Write one vault note explaining a concept from this stretch from memory, as if teaching a sharp junior. Writing from memory is the retention step; the gaps you hit while writing are precisely what you hadn't actually learned.
- **Day 243 · Fri · theory** — **Light day + Work Debrief**  
  Rest the brain — optional light reading only. Do the 15-minute Work Debrief: what broke at work this week, which roadmap topic explains it, what you'd do differently. Log it.
- **Day 244 · Sat · build** — **No new build — finish, or rest**  
  No new build this week. If a the AI Engineering phase build is unfinished, use this long block to take it end-to-end. If you're fully caught up: rest guilt-free, or refactor and document one prior build until it's portfolio-ready. Momentum is protected by rest, not spent by it.
- **Day 245 · Sun · consolidate** — **Consolidate the stretch**  
  Consolidate everything so far: skim your vault notes, confirm every Weeks 19-31 mastery check you can now answer cold, and jot the 2-3 threads still weakest — those become next week's morning warm-ups. Then stop. You've earned the reset.
  
  🎯 *Mastery:* Can you answer every Weeks 19-31 mastery check cold? List the ones you can't — that list is your real progress map.

## Week 36

- **Day 246 · Mon · theory** — **Why Go owns infra + syntax speedrun**  
  Static single-binary deploys (no runtime, no venv — `scp` and run; the operational argument), fast compiles, boring-by-design language. Speedrun the Tour of Go: types, structs, methods, slices/maps, and interfaces — implicit satisfaction (no `implements` keyword; if it has the methods, it is the thing) as the design idea that makes the ecosystem composable.
- **Day 247 · Tue · theory** — **Errors as values + the idioms**  
  No exceptions: `val, err :=` and the explicit `if err != nil` discipline (annoying for a week, then genuinely clarifying — every failure path is visible in the code), `defer` for cleanup (RAII without objects), pointers without arithmetic, zero values as design.
- **Day 248 · Wed · theory** — **Goroutines + channels from zero**  
  CSP model: don't communicate by sharing memory; share memory by communicating. Goroutines as cheap (KB-stack, multiplexed onto OS threads by the runtime scheduler — contrast with Python: preemptive and parallel, no GIL, no colored async/sync function divide), channels as typed pipes, `select` as the multiplexer. The classic footgun: goroutine leaks (a goroutine blocked forever on a channel nobody reads).
- **Day 249 · Thu · theory** — **The toolchain**  
  `go mod` (dependency management that just works), `go test` + table-driven tests (the house style), `go test -bench`, `go test -race` (the race detector — a genuine marvel; you'll use it Saturday), `gofmt` ending all formatting debates by decree.
- **Day 250 · Fri · theory** — **Reading real infrastructure code**  
  Guided skim: the kubelet's main loop entry or a simple controller from `sample-controller` — recognize the reconciliation pattern you know from Week 35 *in the language it's written in*; then `net/http`: a production-adequate HTTP server in 20 lines, no framework.
- **Day 251 · Sat · build** — **Deep Build — Go for Platform Engineers (Phase 3 On-Ramp)**  
  [Block A] Rewrite Week 4's replicated KV store in Go: leader + followers, HTTP replication, goroutine-per-request, a channel-based replication queue. Same system, second language — the comparison teaches both. [Block B] Make it concurrent on purpose, then correct: introduce a data race on the store map (concurrent map writes), catch it with `-race`, fix twice — once with `sync.RWMutex`, once with a channel-owning goroutine — and articulate when each style wins. [Block C] Commit `kvstore-go`; README compares the Python and Go versions honestly (LOC, latency under `hey`, failure visibility).
- **Day 252 · Sun · consolidate** — **Consolidate — Go for Platform Engineers (Phase 3 On-Ramp)**  
  [Block D] Build one real tool you'll keep: a small CLI (`laketool`) that checks your Delta tables' health (row counts, last-commit age, small-file counts via the transaction log) and posts to Telegram — cross-compiled as a static binary running on your fleet infrastructure. Go's deployment story, experienced firsthand. [Block E] Vault note: "Goroutines vs asyncio — two concurrency religions and what each punishes." [Block F] Drill: "Why can a Go service handle blocking calls casually while Python asyncio can't afford a single one?" Plan Week 33.
  
  🎯 *Mastery:* A goroutine leak and an asyncio task leak both waste memory — but only one can also deadlock your program silently at scale. Which, and via what mechanism?

## Week 37

- **Day 253 · Mon · theory** — **The truth about containers**  
  Not lightweight VMs: a container is a normal Linux process wearing blinders (namespaces: it can't *see* other processes/networks/mounts/users) and a leash (cgroups: it can't *use* more than its share). No hypervisor, no guest kernel — same kernel, restricted view. Everything from Week 1 applies directly.
- **Day 254 · Tue · theory** — **Namespaces, one by one**  
  PID (your process is PID 1 inside — and inherits PID 1's reaping duties, the zombie bug factory), mount (private filesystem view), network (own interfaces/routes/iptables), UTS (hostname), IPC, user (root inside ≠ root outside — the rootless-container foundation). `lsns`, `/proc/<pid>/ns/`.
- **Day 255 · Wed · theory** — **cgroups v2**  
  Unified hierarchy in `/sys/fs/cgroup/`, controllers (cpu, memory, io, pids), `memory.max` → OOM-kill semantics inside the group, cpu.max as throttling not priority. How systemd (Week 1) and Docker are both just cgroup managers with different accents.
- **Day 256 · Thu · theory** — **Images and layers**  
  Each Dockerfile instruction = an immutable, content-addressed layer (Git-object energy); layer caching and why instruction *order* is a performance decision (dependencies before code). OverlayFS: lowerdirs (image layers) + upperdir (container's writable layer) merged into one view; copy-up on first write — why writing one byte to a big file in a lower layer is expensive.
- **Day 257 · Fri · theory** — **Dockerfile craft + networking**  
  Multi-stage builds (build stage with toolchains → slim runtime), non-root USER, HEALTHCHECK, .dockerignore, pinned digests. Bridge networking: veth pairs, docker0, NAT for egress, port publishing as iptables DNAT; embedded DNS for container-name resolution.
- **Day 258 · Sat · build** — **Deep Build — Containers Are Linux (Namespaces, cgroups, OverlayFS)**  
  [Block A] Build a container with zero Docker: `unshare --pid --mount --uts --net --fork` + pivot_root into a minimal rootfs (debootstrap or an exported image tarball) + manual cgroup limits via `/sys/fs/cgroup`. Get a shell that genuinely can't see the host. This 2-hour exercise permanently demystifies the field. [Block B] Verify Docker is doing the same thing: run a container, find its host PID, diff its namespace inodes against `unshare`'s; `docker run --memory=100m` a memory hog and read the cgroup OOM kill in `journalctl -k`; inspect OverlayFS mounts (`docker inspect` → GraphDriver) and find your upperdir on disk. [Block C] `internals-labs` gets its best entry yet: "I built a container from syscalls."
- **Day 259 · Sun · consolidate** — **Consolidate — Containers Are Linux (Namespaces, cgroups, OverlayFS)**  
  [Block D] Containerize DocMind for real: multi-stage build, target <300MB from a naive 1.5GB+ (document every shrinking step and its mechanism), tini for PID-1 signal handling (prove the before/after with `docker stop` timing — SIGTERM ignored vs handled), non-root user, healthcheck. [Block E] Vault note: "A container is a process — the five-minute proof." [Block F] Drill: "Why does `docker stop` take exactly 10 seconds on badly built images?" Plan Week 34.
  
  🎯 *Mastery:* Inside a container, `ps` shows your app as PID 1. Name two kernel-level consequences of being PID 1 and the bug each one causes in careless images.

## Week 38

- **Day 260 · Mon · theory** — **Registries + content addressing**  
  Manifests, digests (sha256 — the only honest identifier; tags are mutable lies), multi-arch manifest lists, GHCR as your home (you're a GitHub native). Pull-by-digest for production; the `latest` tag as an incident generator.
- **Day 261 · Tue · theory** — **Compose as local orchestration**  
  Services, networks, named volumes vs binds, `depends_on` with `condition: service_healthy` (the correct startup-ordering answer), profiles, env files and the secrets-in-env sin.
- **Day 262 · Wed · theory** — **CI mechanics**  
  GitHub Actions deeply (you run a fleet on it — now formalize): workflow triggers, job matrices, caching semantics (actions/cache keys, docker buildx `cache-from/to` with GHA cache), artifacts, environments + protection rules, OIDC for cloud auth (no long-lived secrets in repos — this is the modern answer, learn it now).
- **Day 263 · Thu · theory** — **Supply chain**  
  Image scanning (trivy), SBOMs (syft) at awareness level, pinning actions by SHA, Dependabot, least-privilege GITHUB_TOKEN, secret scanning. Threat model: what a malicious dependency or hijacked action can reach in your pipeline.
- **Day 264 · Fri · theory** — **Runtime hygiene + 12-factor**  
  Read-only root fs, dropped capabilities, resource limits in compose, log-to-stdout discipline, config-from-env. Score DocMind against all 12 factors honestly; fix the failures on paper.
- **Day 265 · Sat · build** — **Deep Build — Registries, CI Pipelines, Supply-Chain Hygiene**  
  [Block A] The full image pipeline: push to DocMind → Actions builds multi-stage image (buildx, GHA layer cache) → trivy scan (fail on HIGH) → push to GHCR tagged `sha-<gitsha>` + semver on release. [Block B] Compose production-posture file: pull-by-digest, healthcheck-gated startup ordering (app waits for Qdrant healthy), read-only root, resource limits, log config. Break the pipeline twice on purpose (introduce a HIGH CVE base image; break the healthcheck) and watch the gates catch both. [Block C] Commit; pipeline badge in README.
- **Day 266 · Sun · consolidate** — **Consolidate — Registries, CI Pipelines, Supply-Chain Hygiene**  
  [Block D] Migrate one fleet bot's Actions workflow to best practice: SHA-pinned actions, least-privilege token, caching, OIDC if it touches cloud. Timed comparison: cached vs uncached build. [Block E] Vault note: "Tags lie, digests don't — image identity and the supply chain." [Block F] Drill: "Walk me through what happens between `git push` and a new image in the registry." Plan Week 35.
  
  🎯 *Mastery:* Two builds from an identical Dockerfile produce different digests. List the sources of non-determinism and which ones you can eliminate.

## Week 39

- **Day 267 · Mon · theory** — **Why k8s + the core idea**  
  Compose runs containers on one machine; k8s runs them on a fleet with self-healing, scaling, rolling deploys. The one idea underneath everything: **desired-state reconciliation** — you declare a target in the API, controllers watch and relentlessly converge reality toward it (a thermostat, not a script). Everything else is detail.
- **Day 268 · Tue · theory** — **Architecture**  
  Control plane: API server (the only door; everything talks through it), etcd (the state — Raft again, Week 4 forever), scheduler (pod→node assignment by filters+scores), controller-manager (the reconciliation loops). Nodes: kubelet (node agent), kube-proxy (service plumbing), containerd. Trace a `kubectl apply` end to end: API → etcd → scheduler → kubelet → containerd.
- **Day 269 · Wed · theory** — **Pods**  
  The atom: one or more containers sharing network namespace (localhost between them — Week 33 explains *how*) and volumes. Why pods, not bare containers: sidecars. Init containers, restart policies, the pause container (the namespace holder — a lovely implementation detail). Liveness vs readiness vs startup probes and the outage each misconfiguration causes.
- **Day 270 · Thu · theory** — **Deployments + rolling updates**  
  Deployment → ReplicaSet → Pods (each layer's one job); rolling updates (`maxSurge`/`maxUnavailable`), rollout history and undo; what happens to in-flight requests during a roll (readiness + preStop + graceful shutdown — the trilogy of zero-downtime deploys, and where SIGTERM handling from Week 33 becomes production-critical).
- **Day 271 · Fri · theory** — **Services + networking model**  
  Every pod gets an IP; flat network (all pods reach all pods). Service = stable virtual IP + load-balancing over label-selected pods; ClusterIP/NodePort/LoadBalancer; kube-proxy's iptables/IPVS translation; CoreDNS names (`svc.ns.svc.cluster.local`); Ingress as the L7 front door (Traefik ships in k3s).
- **Day 272 · Sat · build** — **Deep Build — Kubernetes I (The Reconciliation Machine)**  
  [Block A] k3s on your Mint machine (one command, real cluster). Deploy a stub API: Deployment (3 replicas), Service, Ingress, all three probe types. Kill pods and watch resurrection; `kubectl describe` everything until the events log reads like a story you understand. [Block B] Zero-downtime lab: roll a new image version while a load generator runs (`hey` or locust at steady RPS) — first with no readiness probe/no graceful shutdown (measure the errors), then with the full trilogy (measure zero). The before/after error counts are the whole lesson. [Block C] Manifests to a new `docmind-k8s` repo; lab notes.
- **Day 273 · Sun · consolidate** — **Consolidate — Kubernetes I (The Reconciliation Machine)**  
  [Block D] Packet-path deep dive: from your browser → Ingress → Service → Pod, draw every hop and inspect the machinery at each (Traefik config, `iptables-save | grep` your service, CoreDNS query with `nslookup` from a debug pod). [Block E] Vault note: "Reconciliation: the one idea under all of Kubernetes." [Block F] Drill: "A pod is Running but the service returns 503s. Systematic diagnosis?" Plan Week 36.
  
  🎯 *Mastery:* During a rolling update, a pod passes liveness but fails readiness. Exactly what happens to it, and why is this the correct design?

## Week 40

- **Day 274 · Mon · theory** — **Config + secrets**  
  ConfigMaps/Secrets, env vs volume mounts (volume-mounted configs can hot-reload; env can't), the honest truth about k8s Secrets (base64 ≠ encryption; etcd encryption-at-rest and external secret managers as the real answers).
- **Day 275 · Tue · theory** — **Storage**  
  PV/PVC/StorageClass — the claim-provision dance, access modes, reclaim policies, local-path provisioner in k3s. Why storage is k8s's hardest ops area (state fights scheduling flexibility).
- **Day 276 · Wed · theory** — **StatefulSets**  
  Stable network identity (pod-0, pod-1 + headless service DNS), ordered rollout, per-replica PVCs via volumeClaimTemplates — what Qdrant/Kafka/Postgres actually need and why a Deployment betrays them.
- **Day 277 · Thu · theory** — **Resources + scheduling**  
  Requests (scheduling reservation) vs limits (runtime ceiling — cgroups again), QoS classes (Guaranteed/Burstable/BestEffort) and eviction order under node pressure, CPU throttling vs memory OOMKill (asymmetric punishments — know which resource forgives), reading OOMKilled in `describe`. Scheduler filters/scores, affinity/anti-affinity, taints/tolerations.
- **Day 278 · Fri · theory** — **Autoscaling + disruption**  
  HPA (metrics → replica math, stabilization windows), PodDisruptionBudgets (voluntary-disruption insurance), priority classes. What HPA can't fix (per-request slowness; state).
- **Day 279 · Sat · build** — **Deep Build — Kubernetes II (State, Scheduling, Resources)**  
  [Block A] Qdrant as a proper StatefulSet: headless service, volumeClaimTemplate, resource requests/limits; kill the pod and prove data survives via the PVC; scale to 2 and observe stable identities. [Block B] Resource-pathology lab: deploy a memory hog with limits and read the OOMKill trail (describe + node events + cgroup evidence — Weeks 1/33/36 in one line of investigation); deploy a CPU hog and *measure throttling* (`container_cpu_cfs_throttled_periods` awaits in Week 39, for now `kubectl top` + timing); misconfigure requests (huge) and watch a pod go Unschedulable — read the scheduler's explanation in events. [Block C] Lab notes with the three pathologies.
- **Day 280 · Sun · consolidate** — **Consolidate — Kubernetes II (State, Scheduling, Resources)**  
  [Block D] HPA on DocMind's stub: CPU-based autoscale under locust load — watch scale-up and (patiently) scale-down; add a PDB and attempt a `kubectl drain` that respects it. [Block E] Vault note: "Requests, limits, QoS — the resource contract, and what breaks it." [Block F] Drill: "Pods randomly restart every few days. Walk your investigation." Plan Week 37.
  
  🎯 *Mastery:* Why does k8s throttle CPU-over-limit but kill memory-over-limit? Answer from the nature of the two resources.

## Week 41

- **Day 281 · Mon · theory** — **Helm's job**  
  Charts = templated, versioned, releasable bundles of manifests (a package manager whose packages are YAML factories). Templates + values.yaml, release lifecycle, `helm upgrade --install`, rollbacks, hooks. When raw manifests + kustomize suffice (know both positions).
- **Day 282 · Tue · theory** — **Chart craft**  
  `helm create` anatomy, _helpers.tpl, values schema, dependencies (subcharts — how you'll pull in kube-prometheus-stack later), `helm template` for debugging (rendered YAML is the truth), lint.
- **Day 283 · Wed · theory** — **GitOps**  
  The model: Git as the single source of truth; an in-cluster agent (Argo CD) continuously reconciles cluster ← Git — reconciliation again, one level up. Push-based CI/CD vs pull-based GitOps: audit trail, drift detection, rollback = `git revert`. App-of-apps pattern at awareness level.
- **Day 284 · Thu · theory** — **Argo CD mechanics**  
  Application CRD, sync policies (manual vs auto, prune, self-heal), health assessment, sync waves. Secrets in GitOps (sealed-secrets / SOPS — the standing problem and its answers).
- **Day 285 · Fri · theory** — **kubectl fluency day**  
  Deliberate practice list: contexts/namespaces, `-o yaml`/jsonpath, `--dry-run=client -o yaml` as your manifest generator, events sorting, debug containers (`kubectl debug`), port-forward, rollout commands. 30 minutes of reps — fluency here is interview body language.
- **Day 286 · Sat · build** — **Deep Build — Helm + GitOps (Argo CD)**  
  [Block A] Chart DocMind: app + Qdrant (StatefulSet) + Ingress + probes + resources, values for image tag/replicas/resources; `helm install` from zero to serving; uninstall/reinstall to prove reproducibility. [Block B] Argo CD onto k3s: point an Application at your chart repo; make a change via pure Git commit and watch it sync; introduce manual drift (`kubectl edit` a replica count) and watch self-heal revert it — GitOps's party trick, performed live. [Block C] Repo structure documented (app repo vs deploy repo — pick the two-repo pattern and defend it).
- **Day 287 · Sun · consolidate** — **Consolidate — Helm + GitOps (Argo CD)**  
  [Block D] Rollback drill: ship a deliberately broken image via Git; watch health degrade in Argo; roll back with `git revert`; measure time-to-recovery. Write the runbook. [Block E] Vault note: "GitOps: reconciliation applied to deployment itself." [Block F] Drill: "Compare push CI/CD vs GitOps for a 5-person team. Recommendation?" Plan Week 38.
  
  🎯 *Mastery:* Argo CD shows an app Synced but Degraded. What's the difference between those two assessments, and what class of problem produces exactly this pair?

## Week 42

- **Day 288 · Mon · theory** — **IaC's contract**  
  Console-clicking = unreviewable snowflakes. Declare in HCL → `plan` (the diff — read it like a PR) → `apply` (converge). State: Terraform's record linking config to real resource IDs — why it exists (mapping + performance + dependencies), why losing it hurts, why two people applying concurrently corrupts it (locking).
- **Day 289 · Tue · theory** — **Language core**  
  Providers, resources, data sources, variables/outputs/locals, expressions, `for_each` vs `count` (and the index-shuffle trap that makes `count` dangerous for sets), lifecycle meta-arguments (`prevent_destroy`, `create_before_destroy`).
- **Day 290 · Wed · theory** — **State operations**  
  Remote backends (Azure Storage backend — home turf) + locking, `state mv/rm`, `import` (adopting clicked resources — the brownfield reality), targeted applies and their dangers, workspaces honestly assessed (folders-per-env usually beats workspaces; hold the opinion).
- **Day 291 · Thu · theory** — **Modules**  
  Reusable infra components (functions for infrastructure): inputs/outputs, composition, versioned sources, the root-module-per-environment layout. Registry modules: read one good one (Azure network module) as literature.
- **Day 292 · Fri · theory** — **Terraform in CI + drift**  
  Plan-on-PR (post the plan as a comment), apply-on-merge with OIDC (Week 34 pays off — no cloud secrets in GitHub), drift detection via scheduled plans, policy checks at awareness level (tflint, checkov).
- **Day 293 · Sat · build** — **Deep Build — Terraform (Infrastructure as Code)**  
  [Block A] Zero-cost real Terraform: the GitHub provider manages your actual estate — fleet repos' settings, branch protections, labels, secrets — imported (`terraform import`) then codified. Your existing infrastructure, now in code with a plan/apply workflow. (Genuinely useful forever: new bot repo = 10 lines of HCL.) [Block B] Azure pass on free credits: resource group + storage account (with the state backend bootstrapped into it — the chicken-and-egg dance every team does) + a container instance running your DocMind image from GHCR. `plan`, `apply`, verify, and a disciplined `destroy` — leaving no bill is part of the skill. [Block C] Commit `infra` repo; module-ize the repo-config pattern.
- **Day 294 · Sun · consolidate** — **Consolidate — Terraform (Infrastructure as Code)**  
  [Block D] CI integration: plan-on-PR posting the diff as a PR comment, apply-on-merge, OIDC to Azure. Ship one infra change through the full loop. [Block E] Vault note: "State: why Terraform needs a memory, and how teams share one safely." [Block F] Drill: "A teammate clicked a change in the Azure portal. What happens to your next plan, and what are your options?" Plan Week 39.
  
  🎯 *Mastery:* Why does changing one element of a `count`-based resource list sometimes destroy and recreate resources you didn't touch, and how does `for_each` fix it?

## Week 43

- **Day 295 · Mon · theory** — **Catch-up — finish an unfinished build**  
  Breather week, no new material. Go back to any build from the core DevOps weeks you left half-done or skipped and finish it properly — a working, documented artifact beats moving on with a hole in it. If everything's done, take your weakest build and harden it: tests, error handling, a README diagram.
- **Day 296 · Tue · theory** — **Re-answer the mastery checks, cold**  
  Re-answer the Weeks 32-38 mastery questions out loud, from memory, no notes. Each one you fumble marks a topic to re-read today. This is the honest audit — the whole point of the week is to find the soft spots while they're still cheap to fix.
- **Day 297 · Wed · theory** — **Re-read the one topic that's still fuzzy**  
  Pick the single concept from this stretch that still feels hand-wavy and re-read the primary source on it — the doc, the paper, the DDIA chapter, not a blog. Depth on one shaky idea now prevents a collapsed build later.
- **Day 298 · Thu · theory** — **Teach it back (vault note)**  
  Write one vault note explaining a concept from this stretch from memory, as if teaching a sharp junior. Writing from memory is the retention step; the gaps you hit while writing are precisely what you hadn't actually learned.
- **Day 299 · Fri · theory** — **Light day + Work Debrief**  
  Rest the brain — optional light reading only. Do the 15-minute Work Debrief: what broke at work this week, which roadmap topic explains it, what you'd do differently. Log it.
- **Day 300 · Sat · build** — **No new build — finish, or rest**  
  No new build this week. If a the core DevOps weeks build is unfinished, use this long block to take it end-to-end. If you're fully caught up: rest guilt-free, or refactor and document one prior build until it's portfolio-ready. Momentum is protected by rest, not spent by it.
- **Day 301 · Sun · consolidate** — **Consolidate the stretch**  
  Consolidate everything so far: skim your vault notes, confirm every Weeks 32-38 mastery check you can now answer cold, and jot the 2-3 threads still weakest — those become next week's morning warm-ups. Then stop. You've earned the reset.
  
  🎯 *Mastery:* Can you answer every Weeks 32-38 mastery check cold? List the ones you can't — that list is your real progress map.

## Week 44

- **Day 302 · Mon · theory** — **The three pillars**  
  Metrics (aggregated numbers over time — the scoreboard), logs (discrete events — ball-by-ball commentary), traces (one request's journey — the third-umpire replay). Which questions each answers; cardinality as the tax collector of the metrics world (a label with user-IDs = a time series per user = a dead Prometheus — internalize this early).
- **Day 303 · Tue · theory** — **Prometheus model**  
  Pull-based scraping (targets expose `/metrics`; Prometheus collects), service discovery (kubernetes_sd — how it finds your pods), the TSDB shape (time series = metric name + label set), metric types: counter (only up; rate() extracts meaning), gauge, histogram (buckets — cumulative! — plus _sum/_count), summary vs histogram tradeoffs.
- **Day 304 · Wed · theory** — **PromQL**  
  Instant vs range vectors, `rate()`/`increase()` (and why rate over a counter survives restarts), aggregation with `by`/`without`, `histogram_quantile()` (bucket interpolation — your p99 is an *estimate*; bucket layout decides its honesty). Write 10 queries on paper before touching a keyboard.
- **Day 305 · Thu · theory** — **Instrumentation practice**  
  RED method (Rate, Errors, Duration per service) as the default dashboard recipe; USE (Utilization, Saturation, Errors) for resources; `prometheus_client` in Python (counter/gauge/histogram; label discipline), what to instrument in DocMind: per-stage retrieval latency, token costs, cache hits.
- **Day 306 · Fri · theory** — **Alerting philosophy**  
  Symptoms not causes (alert on p99 and error rate, not CPU%), burn-rate thinking (preview of SLOs next week), Alertmanager routing/grouping/silences, the pager-fatigue death spiral and why fewer, better alerts win.
- **Day 307 · Sat · build** — **Deep Build — Observability I (Prometheus + Grafana)**  
  [Block A] kube-prometheus-stack via Helm onto k3s (Week 37's subchart knowledge applies). Instrument DocMind with `prometheus_client`: request counter (route+status labels), latency histogram with hand-chosen buckets bracketing your real p50–p99, in-flight gauge, retrieval-stage histograms. ServiceMonitor to get scraped. [Block B] Build the DocMind Grafana dashboard from raw PromQL (no imported dashboards — you're here to learn the queries): RPS, error rate, p50/p95/p99, stage-latency breakdown, pod restarts, container memory vs limit (the OOM-predictor panel). [Block C] Dashboard JSON committed to the deploy repo (dashboards are code too).
- **Day 308 · Sun · consolidate** — **Consolidate — Observability I (Prometheus + Grafana)**  
  [Block D] Load-test theatre: locust run while watching your dashboard live; then induce pathologies (kill Qdrant; add artificial latency) and verify each is *visible and diagnosable* from the dashboard alone. If you needed kubectl to diagnose, the dashboard is incomplete — iterate. [Block E] Vault note: "Histograms and the lies of percentiles" — bucket math included. [Block F] Drill: "p99 latency doubled but p50 is flat. What hypotheses does that shape suggest?" Plan Week 40.
  
  🎯 *Mastery:* Why can you not average percentiles across pods, and what does `histogram_quantile(0.99, sum(rate(...)) by (le))` do instead that's correct?

## Week 45

- **Day 309 · Mon · theory** — **Structured logging**  
  JSON logs, correlation IDs threaded through every layer (middleware assigns; every log line carries), log levels used honestly, the stdout contract in containers, Loki as the k8s-native aggregator (label-indexed like Prometheus, not full-text like Elasticsearch — cheaper, different queries).
- **Day 310 · Tue · theory** — **Distributed tracing**  
  Spans, trace context propagation (W3C traceparent headers — how the ID crosses service boundaries), OpenTelemetry as the standard (SDK → OTLP → collector → backend), sampling strategies (head vs tail). For DocMind: a trace = router span → retrieval spans → rerank span → LLM span, each with attributes.
- **Day 311 · Wed · theory** — **SLOs from zero**  
  SLI (the measurement: fraction of good events), SLO (the target: 99.5% of requests under 2s over 30 days), error budget (1 − SLO — the license to ship risk), burn-rate alerts (fast-burn page, slow-burn ticket — the multiwindow pattern). Why SLOs end the "is it down?" argument with arithmetic.
- **Day 312 · Thu · theory** — **Incident practice**  
  Runbooks (each alert links to one), incident roles at awareness level, blameless postmortems (your Week-8 skew postmortem was practice; formalize the template: timeline, impact, root causes, contributing factors, actions), the "five whys" and its limits.
- **Day 313 · Fri · theory** — **Synthesis: the observable service checklist**  
  Metrics (RED + resources), structured logs with correlation IDs, traces on the critical path, SLO with burn alerts, runbook, dashboard-as-code. Score DocMind; enumerate gaps for the weekend.
- **Day 314 · Sat · build** — **Deep Build — Observability II + SRE Practice (Logs, Traces, SLOs)**  
  [Block A] OpenTelemetry into DocMind: auto + manual instrumentation, correlation ID middleware, OTLP → collector → Jaeger (or Grafana Tempo) on k3s; find one real slow query and read its waterfall — see the stage that eats the time. [Block B] Loki + promtail via Helm; structured JSON logging in DocMind; the party trick that justifies the whole stack: jump from a slow trace ID → its exact log lines in one query. [Block C] Commit; observability README section with screenshots.
- **Day 315 · Sun · consolidate** — **Consolidate — Observability II + SRE Practice (Logs, Traces, SLOs)**  
  [Block D] Define DocMind's SLOs for real (availability + latency, honest targets), implement burn-rate alerts (multiwindow multiburn — copy the SRE-workbook pattern), write runbooks for your top 3 alerts, and run one game-day: trigger each alert artificially, follow your own runbook, note where it lied. [Block E] Vault note: "Error budgets: turning reliability into a number you can spend." [Block F] Drill: "Design SLOs for a RAG API. Which SLIs, which windows, why?" Plan capstone.
  
  🎯 *Mastery:* Your 99.9% SLO has a 30-day window. A fast-burn alert fires at 14× burn rate. How long until the budget is gone, and why does that arithmetic justify paging a human at 2 AM?

## Week 46

- **Day 316 · Mon · theory** — **The Azure↔AWS Rosetta Stone**  
  You've lived in both houses (DynamoDB then Databricks-on-Azure); formalize the mapping so interviews can't wrong-foot you: compute (VM/EC2, Functions/Lambda, AKS/EKS), storage (Blob+ADLS/S3, Managed Disks/EBS), data (Synapse-Fabric/Redshift-Athena, Event Hubs/Kinesis-MSK, Cosmos/DynamoDB — your old team), networking (VNet/VPC, Private Endpoint/PrivateLink). Identity as the real differentiator: Entra ID + RBAC scopes vs IAM policies/roles/STS — spend most of the hour here; identity is where clouds actually differ.
- **Day 317 · Tue · theory** — **Managed Kubernetes reality**  
  AKS vs EKS vs your k3s: what the provider owns (control plane, etcd) vs what you still own (nodes, upgrades, everything above), node pools, cluster autoscaler vs HPA (different axes), LoadBalancer Services wiring to cloud LBs, ingress controllers in managed contexts, workload identity (pod→cloud auth without secrets — OIDC again, Week 34's pattern at the pod level).
- **Day 318 · Wed · theory** — **Service mesh from zero**  
  The problem: once you have many services you want mTLS everywhere, retries/timeouts, traffic splitting, and uniform telemetry — *without* re-implementing it in every app. The sidecar answer: a proxy (Envoy-class) injected next to each pod, intercepting all traffic via iptables redirect; the control plane programs the proxies. Istio (powerful, heavy) vs Linkerd (minimal, fast); the sidecarless/ambient trend. The honest verdict: below a few dozen services, a mesh is usually over-engineering — hold this opinion with reasons.
- **Day 319 · Thu · theory** — **Network policy + mTLS**  
  The default-allow scandal: vanilla k8s lets every pod talk to every pod; NetworkPolicy as the firewall (namespace default-deny + explicit allows), CNI's role at concept level. mTLS from zero: both sides prove identity with certificates; the mesh rotates certs automatically — identity for workloads, not just users.
- **Day 320 · Fri · theory** — **Multi-environment architecture**  
  Hub-spoke topology, private endpoints (data services never on the public internet — the pattern every Indian enterprise client demands), landing-zone-lite thinking, cost guardrails (budgets, alerts, tagging policy — governance Week 16's cousin). Sketch DocMind's "if a company ran this" Azure architecture on paper.
- **Day 321 · Sat · build** — **Deep Build — Cloud Breadth + Service Mesh & Advanced Networking**  
  [Block A] Linkerd on k3s (the lightweight choice — deliberate): mesh DocMind + Qdrant, verify automatic mTLS between them (`linkerd viz edges` — watch identity appear), observe golden metrics per route without touching a line of app code — the mesh's whole sales pitch, experienced. [Block B] Canary by traffic split: two DocMind versions behind a TrafficSplit, shift 10% → 50% → 100% while locust runs and your Week 39 dashboards watch — progressive delivery, the pattern GitOps tools automate (Argo Rollouts, noted for later). [Block C] Lab notes; honest verdict written: what the mesh cost (resource overhead measured, complexity felt) vs bought.
- **Day 322 · Sun · consolidate** — **Consolidate — Cloud Breadth + Service Mesh & Advanced Networking**  
  [Block D] NetworkPolicy lab: default-deny the namespace, watch DocMind break, restore with minimal explicit allows, prove isolation from a debug pod in another namespace. Then the Rosetta note: one page mapping your entire platform to AKS-native and EKS-native equivalents. [Block E] Vault note: "What a sidecar actually intercepts — iptables, certificates, and the tax." [Block F] Drill: "CTO asks: should we adopt a service mesh? We run 8 services. Advise." Plan the capstone.
  
  🎯 *Mastery:* How does a sidecar transparently intercept a pod's traffic without the application knowing, and what does that mechanism cost per request?

## Week 47

- **Day 323 · Mon · theory** — **Capstone slot 1/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) (1) final CI/CD topology (Actions builds/tests/evals → GHCR → Argo CD pulls — draw it), (2) eval-gate placement and thresholds (which failures block; which warn), (3) secrets flow end to end (OIDC, sealed-secrets), (4) environment strategy (staging namespace vs cluster), (5) rollback doctrine (what triggers auto-rollback; what needs a human).
- **Day 324 · Tue · theory** — **Capstone slot 2/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) (1) final CI/CD topology (Actions builds/tests/evals → GHCR → Argo CD pulls — draw it), (2) eval-gate placement and thresholds (which failures block; which warn), (3) secrets flow end to end (OIDC, sealed-secrets), (4) environment strategy (staging namespace vs cluster), (5) rollback doctrine (what triggers auto-rollback; what needs a human).
- **Day 325 · Wed · theory** — **Capstone slot 3/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) (1) final CI/CD topology (Actions builds/tests/evals → GHCR → Argo CD pulls — draw it), (2) eval-gate placement and thresholds (which failures block; which warn), (3) secrets flow end to end (OIDC, sealed-secrets), (4) environment strategy (staging namespace vs cluster), (5) rollback doctrine (what triggers auto-rollback; what needs a human).
- **Day 326 · Thu · theory** — **Capstone slot 4/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) (1) final CI/CD topology (Actions builds/tests/evals → GHCR → Argo CD pulls — draw it), (2) eval-gate placement and thresholds (which failures block; which warn), (3) secrets flow end to end (OIDC, sealed-secrets), (4) environment strategy (staging namespace vs cluster), (5) rollback doctrine (what triggers auto-rollback; what needs a human).
- **Day 327 · Fri · theory** — **Capstone slot 5/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) (1) final CI/CD topology (Actions builds/tests/evals → GHCR → Argo CD pulls — draw it), (2) eval-gate placement and thresholds (which failures block; which warn), (3) secrets flow end to end (OIDC, sealed-secrets), (4) environment strategy (staging namespace vs cluster), (5) rollback doctrine (what triggers auto-rollback; what needs a human).
- **Day 328 · Sat · build** — **Deep Build — Phase 3 Capstone: The Fully Operated Platform**  
  [Sat A] Close the loop: merge to main → tests + eval harness (Week 25/30 in CI) → image build/scan → GHCR → Argo CD syncs k3s. LLMOps, actually practiced: a retrieval regression now fails a deploy *before* users see it. [Sat B] Full drill: ship a real change hands-off, commit-to-production; then ship a quality-regressing change and watch the eval gate stop it. Screenshot both. [Sat C] Secrets audit — nothing sensitive in Git, OIDC everywhere possible.
- **Day 329 · Sun · consolidate** — **Consolidate — Phase 3 Capstone: The Fully Operated Platform**  
  [Sun D] Wire the lakehouse in: Dagster deployed to k3s (Helm chart exists), one end-to-end flow: event → Kafka → stream → Delta → dbt mart → MCP server queries it — all on the cluster, all observable. [Sun E/F] ADR-vs-reality review; drill; plan final week.

## Week 48

- **Day 330 · Mon · theory** — **Capstone slot 1/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) one blog post or README-depth writeup; one new tool evaluated *against* your stack with a keep/reject verdict ("does Iceberg replace Delta here?" "does Flink earn its ops cost?"); full eval-suite rerun with drift check.
- **Day 331 · Tue · theory** — **Capstone slot 2/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) one blog post or README-depth writeup; one new tool evaluated *against* your stack with a keep/reject verdict ("does Iceberg replace Delta here?" "does Flink earn its ops cost?"); full eval-suite rerun with drift check.
- **Day 332 · Wed · theory** — **Capstone slot 3/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) one blog post or README-depth writeup; one new tool evaluated *against* your stack with a keep/reject verdict ("does Iceberg replace Delta here?" "does Flink earn its ops cost?"); full eval-suite rerun with drift check.
- **Day 333 · Thu · theory** — **Capstone slot 4/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) one blog post or README-depth writeup; one new tool evaluated *against* your stack with a keep/reject verdict ("does Iceberg replace Delta here?" "does Flink earn its ops cost?"); full eval-suite rerun with drift check.
- **Day 334 · Fri · theory** — **Capstone slot 5/5 — Phase 3 Capstone: The Fully Operated Platform**  
  (One of five weekday slots this week.) one blog post or README-depth writeup; one new tool evaluated *against* your stack with a keep/reject verdict ("does Iceberg replace Delta here?" "does Flink earn its ops cost?"); full eval-suite rerun with drift check.
- **Day 335 · Sat · build** — **Deep Build — Phase 3 Capstone: The Fully Operated Platform**  
  [Sat A] Failure-drill gauntlet (your war-story inventory): kill Qdrant mid-query (degradation ladder must hold), OOM the app under load (dashboard must show it before kubectl does), fill the PVC, corrupt a config via drift (Argo must heal), delete a pod during a rolling deploy. Postmortem-format writeups for each. [Sat B] The capstone document: one architecture diagram spanning event → Kafka → lakehouse → marts → RAG → k8s → GitOps → observability. It should look like a system a small company would pay for — because it is. [Sat C] Blog post #3: "From notebook to production: operating a RAG system on Kubernetes."
- **Day 336 · Sun · consolidate** — **Consolidate — Phase 3 Capstone: The Fully Operated Platform**  
  [Sun D] Final recorded walkthrough — 20 minutes, whole platform, every layer justified. [Sun E] Watch it. Cringe. Note stumbles. This recording, iterated, becomes your interview superpower. [Sun F] Phase 3 retrospective. Celebrate properly — you've earned a full evening of FL Studio with zero guilt.
