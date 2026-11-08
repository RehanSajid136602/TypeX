/**
 * A dependency-buffering RGA-style sequence CRDT for plain text.
 *
 * The sequence is an ordered forest of characters.  A character is always
 * inserted as a child of the character it follows (or as a root when `after`
 * is null).  Siblings are ordered by descending (counter, site), which gives a
 * deterministic tie-break for concurrent inserts.  Each logical node has an
 * end marker in the global implicit treap, so the next sibling position can be
 * found without walking a potentially long chain of descendants.
 */

export type OpId = { site: string; counter: number };
export type Op =
  | { type: "insert"; id: OpId; after: OpId | null; char: string }
  | { type: "delete"; id: OpId; target: OpId };

type SeqNode = {
  id: OpId | null;
  idKey: string;
  char: string;
  isEnd: boolean;
  visible: boolean;

  // Implicit treap over the flattened sequence (characters + end markers).
  gl: SeqNode | null;
  gr: SeqNode | null;
  gp: SeqNode | null;
  prio: number;
  size: number;
  vcount: number;

  // Treap of siblings (children of the same parent, or roots).
  sl: SeqNode | null;
  sr: SeqNode | null;
  childRoot: SeqNode | null;

  // Logical RGA structure.
  parent: SeqNode | null;
  end: SeqNode | null;
};

type SerializedReplica = {
  version: number;
  site: string;
  ops: Op[];
};

const SERIAL_VERSION = 2;

// A public counter packs an epoch (the Lamport component) and a per-site
// sequence number: counter = epoch * COUNTER_SCALE + sequence.  Epoch zero is
// used until a remote operation is seen, so purely local counters stay 1,2,3...
// The scale leaves room for more than 67 million local operations per site and
// keeps all packed counters inside Number.MAX_SAFE_INTEGER for the supported
// scale (hundreds of thousands of operations).
const COUNTER_SCALE = 2 ** 26;

function counterEpoch(counter: number): number {
  return Math.floor(counter / COUNTER_SCALE);
}

function counterSequence(counter: number): number {
  return counter % COUNTER_SCALE;
}

function gSize(node: SeqNode | null): number {
  return node === null ? 0 : node.size;
}

function gVisible(node: SeqNode | null): number {
  return node === null ? 0 : node.vcount;
}

function gUpdate(node: SeqNode): void {
  node.size = 1 + gSize(node.gl) + gSize(node.gr);
  node.vcount =
    (node.visible ? 1 : 0) + gVisible(node.gl) + gVisible(node.gr);
  if (node.gl !== null) node.gl.gp = node;
  if (node.gr !== null) node.gr.gp = node;
}

function gMerge(a: SeqNode | null, b: SeqNode | null): SeqNode | null {
  if (a === null) {
    if (b !== null) b.gp = null;
    return b;
  }
  if (b === null) {
    a.gp = null;
    return a;
  }
  if (a.prio > b.prio) {
    const merged = gMerge(a.gr, b);
    a.gr = merged;
    if (merged !== null) merged.gp = a;
    gUpdate(a);
    a.gp = null;
    return a;
  }
  const merged = gMerge(a, b.gl);
  b.gl = merged;
  if (merged !== null) merged.gp = b;
  gUpdate(b);
  b.gp = null;
  return b;
}

function gSplit(
  node: SeqNode | null,
  count: number,
): [SeqNode | null, SeqNode | null] {
  if (node === null) return [null, null];
  const leftSize = gSize(node.gl);
  if (count <= leftSize) {
    const [left, right] = gSplit(node.gl, count);
    node.gl = right;
    if (right !== null) right.gp = node;
    gUpdate(node);
    if (left !== null) left.gp = null;
    node.gp = null;
    return [left, node];
  }
  const [left, right] = gSplit(node.gr, count - leftSize - 1);
  node.gr = left;
  if (left !== null) left.gp = node;
  gUpdate(node);
  if (right !== null) right.gp = null;
  node.gp = null;
  return [node, right];
}

function gInsertPair(
  root: SeqNode | null,
  position: number,
  first: SeqNode,
  second: SeqNode,
): SeqNode {
  const [left, right] = gSplit(root, position);
  first.gl = null;
  first.gr = null;
  first.gp = null;
  first.size = 1;
  first.vcount = first.visible ? 1 : 0;
  second.gl = null;
  second.gr = null;
  second.gp = null;
  second.size = 1;
  second.vcount = 0;
  const withFirst = gMerge(left, first);
  const withSecond = gMerge(withFirst, second);
  const result = gMerge(withSecond, right);
  if (result === null) throw new Error("internal error: empty sequence");
  return result;
}

function gRank(node: SeqNode): number {
  let rank = gSize(node.gl);
  let current = node;
  while (current.gp !== null) {
    const parent = current.gp;
    if (current === parent.gr) rank += gSize(parent.gl) + 1;
    current = parent;
  }
  return rank;
}

function gFindVisible(root: SeqNode | null, index: number): SeqNode {
  let node = root;
  let remaining = index;
  while (node !== null) {
    const leftVisible = gVisible(node.gl);
    if (remaining < leftVisible) {
      node = node.gl;
      continue;
    }
    remaining -= leftVisible;
    if (node.visible) {
      if (remaining === 0) return node;
      remaining -= 1;
    }
    node = node.gr;
  }
  throw new RangeError("visible index is out of range");
}

function compareIds(a: OpId, b: OpId): number {
  if (a.counter !== b.counter) return a.counter > b.counter ? -1 : 1;
  if (a.site === b.site) return 0;
  return a.site > b.site ? -1 : 1;
}

function sibMerge(
  a: SeqNode | null,
  b: SeqNode | null,
): SeqNode | null {
  if (a === null) return b;
  if (b === null) return a;
  if (a.prio > b.prio) {
    a.sr = sibMerge(a.sr, b);
    return a;
  }
  b.sl = sibMerge(a, b.sl);
  return b;
}

function sibSplit(
  node: SeqNode | null,
  id: OpId,
): [SeqNode | null, SeqNode | null] {
  if (node === null) return [null, null];
  // `node.id` is always non-null here; end markers never enter sibling trees.
  const nodeId = node.id as OpId;
  if (compareIds(nodeId, id) < 0) {
    const [left, right] = sibSplit(node.sr, id);
    node.sr = left;
    return [node, right];
  }
  const [left, right] = sibSplit(node.sl, id);
  node.sl = right;
  return [left, node];
}

function sibMin(node: SeqNode | null): SeqNode | null {
  let current = node;
  while (current !== null && current.sl !== null) current = current.sl;
  return current;
}

function idKey(id: OpId): string {
  return `${id.site.length}:${id.site}:${id.counter}`;
}

function cloneId(id: OpId): OpId {
  return { site: id.site, counter: id.counter };
}

function cloneOp(op: Op): Op {
  if (op.type === "insert") {
    return {
      type: "insert",
      id: cloneId(op.id),
      after: op.after === null ? null : cloneId(op.after),
      char: op.char,
    };
  }
  return {
    type: "delete",
    id: cloneId(op.id),
    target: cloneId(op.target),
  };
}

function invalidOp(message: string): never {
  throw new Error(`Invalid operation: ${message}`);
}

function assertId(value: unknown, field: string): asserts value is OpId {
  if (typeof value !== "object" || value === null) {
    invalidOp(`${field} must be an object`);
  }
  const candidate = value as { site?: unknown; counter?: unknown };
  if (typeof candidate.site !== "string" || candidate.site.length === 0) {
    invalidOp(`${field}.site must be a non-empty string`);
  }
  if (
    typeof candidate.counter !== "number" ||
    !Number.isInteger(candidate.counter) ||
    candidate.counter < 1 ||
    candidate.counter > Number.MAX_SAFE_INTEGER ||
    counterSequence(candidate.counter) === 0
  ) {
    invalidOp(`${field}.counter must be a positive safe integer with a sequence component`);
  }
}

function validateOp(value: unknown): asserts value is Op {
  if (typeof value !== "object" || value === null) {
    invalidOp("operation must be an object");
  }
  const candidate = value as {
    type?: unknown;
    id?: unknown;
    after?: unknown;
    target?: unknown;
    char?: unknown;
  };
  assertId(candidate.id, "id");
  if (candidate.type === "insert") {
    if (candidate.after !== null) assertId(candidate.after, "after");
    if (typeof candidate.char !== "string") {
      invalidOp("insert.char must be a string");
    }
    if (Array.from(candidate.char).length !== 1) {
      invalidOp("insert.char must contain exactly one Unicode code point");
    }
    return;
  }
  if (candidate.type === "delete") {
    assertId(candidate.target, "target");
    return;
  }
  invalidOp('type must be "insert" or "delete"');
}

export class Replica {
  private readonly site: string;
  private nextSequence = 1;
  private currentEpoch = 0;
  private maxRemoteEpoch = -1;

  private root: SeqNode;
  private readonly rootEnd: SeqNode;
  private rootSiblings: SeqNode | null = null;

  private readonly nodes = new Map<string, SeqNode>();
  private readonly sv = new Map<string, number>();
  private readonly sequenceVector = new Map<string, number>();
  private readonly pendingBySite = new Map<string, Map<number, Op>>();
  private readonly waiting = new Map<string, Set<Op>>();
  private readonly opWaitDeps = new Map<string, Set<string>>();

  private readonly log: Op[] = [];
  private readonly logKeys = new Set<string>();

  private rngState = 0x9e3779b9;

  constructor(site: string) {
    if (typeof site !== "string" || site.length === 0) {
      throw new TypeError("site must be a non-empty string");
    }
    this.site = site;
    this.rootEnd = this.makeNode(null, "", true, false);
    this.root = this.rootEnd;
  }

  insert(index: number, text: string): Op[] {
    if (!Number.isInteger(index)) {
      throw new RangeError("insert index must be an integer");
    }
    if (index < 0 || index > this.length) {
      throw new RangeError(
        `insert index ${index} is out of range for length ${this.length}`,
      );
    }
    if (typeof text !== "string") {
      throw new TypeError("insert text must be a string");
    }
    const characters = Array.from(text);
    if (characters.length === 0) return [];

    let after: OpId | null = null;
    if (index > 0) {
      after = cloneId(gFindVisible(this.root, index - 1).id as OpId);
    }

    const result: Op[] = [];
    for (const char of characters) {
      const id = this.allocateId();
      const op: Op = { type: "insert", id, after, char };
      this.ingest(op);
      result.push(cloneOp(op));
      after = cloneId(id);
    }
    return result;
  }

  delete(index: number, length: number): Op[] {
    if (!Number.isInteger(index)) {
      throw new RangeError("delete index must be an integer");
    }
    if (!Number.isInteger(length)) {
      throw new RangeError("delete length must be an integer");
    }
    if (index < 0) {
      throw new RangeError(`delete index ${index} must not be negative`);
    }
    if (length < 0) {
      throw new RangeError(`delete length ${length} must not be negative`);
    }
    if (index + length > this.length) {
      throw new RangeError(
        `delete range [${index}, ${index + length}) is out of range for length ${this.length}`,
      );
    }
    if (length === 0) return [];

    const targets: OpId[] = [];
    for (let offset = 0; offset < length; offset += 1) {
      const node = gFindVisible(this.root, index);
      targets.push(cloneId(node.id as OpId));
      // Remove it immediately so the next visible character moves into `index`.
      this.setVisible(node, false);
    }

    const result: Op[] = [];
    for (const target of targets) {
      const id = this.allocateId();
      const op: Op = { type: "delete", id, target };
      this.ingest(op);
      result.push(cloneOp(op));
    }
    return result;
  }

  apply(op: Op): void {
    validateOp(op);
    this.ingest(op);
  }

  toString(): string {
    const parts: string[] = [];
    const stack: SeqNode[] = [];
    let current: SeqNode | null = this.root;
    while (current !== null || stack.length > 0) {
      while (current !== null) {
        stack.push(current);
        current = current.gl;
      }
      current = stack.pop() as SeqNode;
      if (!current.isEnd && current.visible) parts.push(current.char);
      current = current.gr;
    }
    return parts.join("");
  }

  get length(): number {
    return this.root.vcount;
  }

  stateVector(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [site, counter] of this.sv) result[site] = counter;
    return result;
  }

  opsSince(vector: Record<string, number>): Op[] {
    const result: Op[] = [];
    for (const op of this.log) {
      const known = vector[op.id.site] ?? 0;
      if (counterSequence(op.id.counter) > counterSequence(known)) {
        result.push(cloneOp(op));
      }
    }
    return result;
  }

  serialize(): string {
    const payload: SerializedReplica = {
      version: SERIAL_VERSION,
      site: this.site,
      ops: this.log.map(cloneOp),
    };
    return JSON.stringify(payload);
  }

  static deserialize(data: string): Replica {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      throw new Error("Invalid serialized replica: malformed JSON");
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Invalid serialized replica: expected an object");
    }
    const candidate = parsed as {
      version?: unknown;
      site?: unknown;
      ops?: unknown;
    };
    if (candidate.version !== SERIAL_VERSION) {
      throw new Error("Invalid serialized replica: unsupported version");
    }
    if (typeof candidate.site !== "string" || candidate.site.length === 0) {
      throw new Error("Invalid serialized replica: bad site");
    }
    if (!Array.isArray(candidate.ops)) {
      throw new Error("Invalid serialized replica: ops must be an array");
    }

    const replica = new Replica(candidate.site);
    for (const raw of candidate.ops) {
      validateOp(raw);
      replica.ingest(raw);
    }

    let nextSequence = 1;
    let currentEpoch = 0;
    let maxRemoteEpoch = -1;
    for (const op of replica.log) {
      const epoch = counterEpoch(op.id.counter);
      const sequence = counterSequence(op.id.counter);
      if (op.id.site === replica.site) {
        if (sequence >= nextSequence) nextSequence = sequence + 1;
        if (epoch > currentEpoch) currentEpoch = epoch;
      } else if (epoch > maxRemoteEpoch) {
        maxRemoteEpoch = epoch;
      }
    }
    replica.nextSequence = nextSequence;
    replica.currentEpoch = currentEpoch;
    replica.maxRemoteEpoch = maxRemoteEpoch;
    return replica;
  }

  private allocateId(): OpId {
    if (this.nextSequence >= COUNTER_SCALE) {
      throw new RangeError("per-site counter space exhausted");
    }
    let epoch = this.currentEpoch;
    if (epoch <= this.maxRemoteEpoch) {
      epoch = this.maxRemoteEpoch + 1;
      this.currentEpoch = epoch;
    }
    const sequence = this.nextSequence;
    this.nextSequence += 1;
    const counter = epoch * COUNTER_SCALE + sequence;
    if (!Number.isSafeInteger(counter)) {
      throw new RangeError("counter exceeds Number.MAX_SAFE_INTEGER");
    }
    return { site: this.site, counter };
  }

  private makeNode(
    id: OpId | null,
    char: string,
    isEnd: boolean,
    visible: boolean,
  ): SeqNode {
    return {
      id,
      idKey: id === null ? "" : idKey(id),
      char,
      isEnd,
      visible,
      gl: null,
      gr: null,
      gp: null,
      prio: this.nextPriority(),
      size: 1,
      vcount: visible ? 1 : 0,
      sl: null,
      sr: null,
      childRoot: null,
      parent: null,
      end: null,
    };
  }

  private nextPriority(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return this.rngState;
  }

  private ingest(raw: Op): void {
    const op = cloneOp(raw);
    const site = op.id.site;
    const counter = op.id.counter;
    const epoch = counterEpoch(counter);
    const sequence = counterSequence(counter);

    if (site === this.site) {
      if (sequence >= this.nextSequence) this.nextSequence = sequence + 1;
      if (epoch > this.currentEpoch) this.currentEpoch = epoch;
    } else if (epoch > this.maxRemoteEpoch) {
      this.maxRemoteEpoch = epoch;
    }

    if (sequence <= (this.sequenceVector.get(site) ?? 0)) return;

    let sitePending = this.pendingBySite.get(site);
    if (sitePending === undefined) {
      sitePending = new Map<number, Op>();
      this.pendingBySite.set(site, sitePending);
    }
    if (sitePending.has(sequence)) return;
    sitePending.set(sequence, op);

    const key = idKey(op.id);
    if (!this.logKeys.has(key)) {
      this.logKeys.add(key);
      this.log.push(op);
    }
    this.drain(site);
  }

  private drain(site: string): void {
    for (;;) {
      const pending = this.pendingBySite.get(site);
      if (pending === undefined) return;
      const next = (this.sequenceVector.get(site) ?? 0) + 1;
      const op = pending.get(next);
      if (op === undefined) return;

      if (!this.dependenciesReady(op)) {
        this.clearWaiting(op);
        this.waitOn(op);
        return;
      }

      this.clearWaiting(op);
      pending.delete(next);
      this.applyReady(op);
      this.sequenceVector.set(site, next);
      this.sv.set(site, op.id.counter);

      // A new insert makes its id available as an `after`/`target`.
      if (op.type === "insert") this.notifyAvailable(idKey(op.id));
      if (pending.size === 0) this.pendingBySite.delete(site);
    }
  }

  private dependenciesReady(op: Op): boolean {
    if (op.type === "insert") {
      return op.after === null || this.nodes.has(idKey(op.after));
    }
    return this.nodes.has(idKey(op.target));
  }

  private missingDependencies(op: Op): string[] {
    if (op.type === "insert") {
      if (op.after !== null && !this.nodes.has(idKey(op.after))) {
        return [idKey(op.after)];
      }
      return [];
    }
    if (!this.nodes.has(idKey(op.target))) return [idKey(op.target)];
    return [];
  }

  private waitOn(op: Op): void {
    const key = idKey(op.id);
    const deps = this.missingDependencies(op);
    if (deps.length === 0) return;
    const recorded = new Set<string>();
    for (const dep of deps) {
      let waiters = this.waiting.get(dep);
      if (waiters === undefined) {
        waiters = new Set<Op>();
        this.waiting.set(dep, waiters);
      }
      waiters.add(op);
      recorded.add(dep);
    }
    this.opWaitDeps.set(key, recorded);
  }

  private clearWaiting(op: Op): void {
    const key = idKey(op.id);
    const deps = this.opWaitDeps.get(key);
    if (deps === undefined) return;
    for (const dep of deps) {
      const waiters = this.waiting.get(dep);
      if (waiters === undefined) continue;
      waiters.delete(op);
      if (waiters.size === 0) this.waiting.delete(dep);
    }
    this.opWaitDeps.delete(key);
  }

  private notifyAvailable(dependency: string): void {
    const waiters = this.waiting.get(dependency);
    if (waiters === undefined) return;
    this.waiting.delete(dependency);
    for (const op of waiters) {
      this.clearWaiting(op);
      this.drain(op.id.site);
    }
  }

  private applyReady(op: Op): void {
    if (op.type === "insert") {
      const parent =
        op.after === null ? null : (this.nodes.get(idKey(op.after)) as SeqNode);
      this.integrateInsert(op.id, op.char, parent);
      return;
    }
    const target = this.nodes.get(idKey(op.target)) as SeqNode;
    if (target.visible) this.setVisible(target, false);
  }

  private integrateInsert(id: OpId, char: string, parent: SeqNode | null): void {
    const node = this.makeNode(id, char, false, true);
    const end = this.makeNode(null, "", true, false);
    node.end = end;

    const siblings = parent === null ? this.rootSiblings : parent.childRoot;
    const [left, right] = sibSplit(siblings, id);
    const next = sibMin(right);
    const merged = sibMerge(sibMerge(left, node), right);
    if (parent === null) {
      this.rootSiblings = merged;
    } else {
      parent.childRoot = merged;
    }

    let position: number;
    if (next !== null) {
      position = gRank(next);
    } else if (parent !== null && parent.end !== null) {
      position = gRank(parent.end);
    } else {
      position = gRank(this.rootEnd);
    }

    node.parent = parent;
    this.root = gInsertPair(this.root, position, node, end);
    this.nodes.set(node.idKey, node);
  }

  private setVisible(node: SeqNode, visible: boolean): void {
    if (node.visible === visible) return;
    node.visible = visible;
    let current: SeqNode | null = node;
    while (current !== null) {
      current.vcount =
        (current.visible ? 1 : 0) +
        gVisible(current.gl) +
        gVisible(current.gr);
      current = current.gp;
    }
  }
}
