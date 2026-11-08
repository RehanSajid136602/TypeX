import test from "node:test";
import assert from "node:assert/strict";
import { Replica, type Op } from "./collab-text.ts";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const temporary = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temporary;
  }
  return result;
}

test("local editing uses code points and validates ranges", () => {
  const replica = new Replica("A");
  replica.insert(0, "a😀b");
  assert.equal(replica.length, 3);
  assert.equal(replica.toString(), "a😀b");

  replica.insert(2, "x");
  assert.equal(replica.toString(), "a😀xb");

  replica.delete(1, 1);
  assert.equal(replica.toString(), "axb");
  assert.equal(replica.length, 3);

  const emoji = new Replica("E");
  emoji.insert(0, "ab");
  emoji.insert(1, "😀");
  assert.equal(emoji.length, 3);
  assert.equal(emoji.toString(), "a😀b");

  assert.throws(() => replica.insert(-1, "x"), RangeError);
  assert.throws(() => replica.insert(replica.length + 1, "x"), RangeError);
  assert.throws(() => replica.insert(0.5, "x"), RangeError);
  assert.throws(() => replica.delete(-1, 0), RangeError);
  assert.throws(() => replica.delete(0, -1), RangeError);
  assert.throws(() => replica.delete(replica.length, 1), RangeError);
  assert.throws(() => replica.delete(1, 10), RangeError);
});

test("local insertion stays at the requested index after receiving remote text", () => {
  const a = new Replica("A");
  const b = new Replica("B");
  const base = a.insert(0, "abc");
  for (const op of base) b.apply(op);

  const bInsert = b.insert(1, "X");
  assert.equal(b.toString(), "aXbc");
  for (const op of bInsert) a.apply(op);
  assert.equal(a.toString(), "aXbc");

  const aInsert = a.insert(2, "Y");
  assert.equal(a.toString(), "aXYbc");
  for (const op of aInsert) b.apply(op);
  assert.equal(b.toString(), "aXYbc");
});

test("remote ops may arrive reversed and duplicated", () => {
  const source = new Replica("A");
  const inserts = source.insert(0, "abc");
  const receiver = new Replica("B");

  receiver.apply(inserts[2] as Op);
  receiver.apply(inserts[1] as Op);
  assert.equal(receiver.toString(), "");
  receiver.apply(inserts[0] as Op);
  assert.equal(receiver.toString(), "abc");

  receiver.apply(inserts[0] as Op);
  receiver.apply(inserts[2] as Op);
  receiver.apply(inserts[1] as Op);
  assert.equal(receiver.toString(), "abc");
  assert.equal(receiver.length, 3);

  const deletes = source.delete(0, 1);
  const deleteFirst = new Replica("C");
  deleteFirst.apply(deletes[0] as Op);
  deleteFirst.apply(inserts[2] as Op);
  deleteFirst.apply(inserts[0] as Op);
  deleteFirst.apply(inserts[1] as Op);
  assert.equal(deleteFirst.toString(), "bc");
});

test("a dependency that is missing at the expected counter is buffered", () => {
  const a = new Replica("A");
  const aOps = a.insert(0, "a");

  const b = new Replica("B");
  b.apply(aOps[0] as Op);
  const bOps = b.insert(1, "b");

  const c = new Replica("C");
  c.apply(bOps[0] as Op);
  assert.equal(c.toString(), "");
  c.apply(aOps[0] as Op);
  assert.equal(c.toString(), "ab");
  c.apply(bOps[0] as Op);
  assert.equal(c.toString(), "ab");
});

test("concurrent runs at the same position do not interleave", () => {
  const a = new Replica("A");
  const b = new Replica("B");
  const aOps = a.insert(0, "abc");
  const bOps = b.insert(0, "xyz");

  const random = mulberry32(0x51f15e);
  const delivery = shuffled(
    [...aOps, ...bOps, ...aOps, ...bOps],
    random,
  );
  for (const op of delivery) {
    a.apply(op);
    b.apply(op);
  }

  assert.equal(a.toString(), b.toString());
  assert.ok(
    a.toString() === "abcxyz" || a.toString() === "xyzabc",
    `runs interleaved: ${a.toString()}`,
  );
});

test("concurrent deletes of the same character are idempotent", () => {
  const a = new Replica("A");
  const b = new Replica("B");
  const base = a.insert(0, "abc");
  for (const op of base) b.apply(op);

  const aDelete = a.delete(1, 1);
  const bDelete = b.delete(1, 1);
  for (const op of bDelete) a.apply(op);
  for (const op of aDelete) b.apply(op);
  assert.equal(a.toString(), "ac");
  assert.equal(b.toString(), "ac");

  for (const op of [...aDelete, ...bDelete, ...aDelete]) a.apply(op);
  assert.equal(a.toString(), "ac");
});

test("one exchange of state vectors converges fully diverged replicas", () => {
  const a = new Replica("A");
  const b = new Replica("B");
  const base = a.insert(0, "hello ");
  for (const op of base) b.apply(op);

  a.insert(a.length, "A");
  b.insert(b.length, "B");
  b.delete(0, 1);

  const vectorA = a.stateVector();
  const vectorB = b.stateVector();
  const forB = a.opsSince(vectorB);
  const forA = b.opsSince(vectorA);

  for (const op of forB) b.apply(op);
  for (const op of forA) a.apply(op);

  assert.equal(a.toString(), b.toString());
  assert.deepEqual(a.stateVector(), b.stateVector());
  assert.equal(a.length, Array.from(a.toString()).length);
});

test("serialize/deserialize preserves pending ops and does not reuse ids", () => {
  const a = new Replica("A");
  const aOps = a.insert(0, "a");

  const b = new Replica("B");
  b.apply(aOps[0] as Op);
  const bOps = b.insert(1, "b");

  const waiting = new Replica("C");
  waiting.apply(bOps[0] as Op);
  const restoredWaiting = Replica.deserialize(waiting.serialize());
  assert.equal(restoredWaiting.toString(), "");
  restoredWaiting.apply(aOps[0] as Op);
  assert.equal(restoredWaiting.toString(), "ab");
  restoredWaiting.apply(bOps[0] as Op);
  assert.equal(restoredWaiting.toString(), "ab");

  const original = new Replica("D");
  original.insert(0, "hello😀");
  original.delete(1, 2);
  const restored = Replica.deserialize(original.serialize());
  assert.equal(restored.toString(), original.toString());
  assert.equal(restored.length, original.length);
  assert.deepEqual(restored.stateVector(), original.stateVector());

  const continuation = restored.insert(restored.length, "!");
  assert.equal(continuation[0]?.id.counter, 9);
  for (const op of continuation) original.apply(op);
  assert.equal(original.toString(), restored.toString());

  const remote = new Replica("R");
  const remoteOps = remote.insert(0, "r");
  const editor = new Replica("E");
  for (const op of remoteOps) editor.apply(op);
  const firstEdit = editor.insert(1, "e");
  const restoredEditor = Replica.deserialize(editor.serialize());
  const secondEdit = restoredEditor.insert(2, "m");
  assert.ok(
    (secondEdit[0]?.id.counter ?? 0) > (firstEdit[0]?.id.counter ?? 0),
  );
  const observer = new Replica("O");
  for (const op of [...remoteOps, ...firstEdit, ...secondEdit]) {
    observer.apply(op);
  }
  assert.equal(observer.toString(), "rem");
});

test("randomized convergence with several replicas and duplicated delivery", () => {
  const random = mulberry32(0xc011ab);
  const sites = ["A", "B", "C", "D"];
  const replicas = sites.map((site) => new Replica(site));
  const allOps: Op[] = [];
  const alphabet = ["a", "b", "c", "x", "y", "z", "é", "中", "😀", "\n"];

  for (let round = 0; round < 16; round += 1) {
    for (const replica of replicas) {
      const before = Array.from(replica.toString());
      if (replica.length === 0 || random() < 0.7) {
        const index = Math.floor(random() * (replica.length + 1));
        const count = 1 + Math.floor(random() * 3);
        let text = "";
        for (let i = 0; i < count; i += 1) {
          text += alphabet[Math.floor(random() * alphabet.length)] as string;
        }
        const expected =
          before.slice(0, index).join("") + text + before.slice(index).join("");
        allOps.push(...replica.insert(index, text));
        assert.equal(replica.toString(), expected);
      } else {
        const index = Math.floor(random() * replica.length);
        const count = 1 + Math.floor(random() * (replica.length - index));
        const expected =
          before.slice(0, index).join("") +
          before.slice(index + count).join("");
        allOps.push(...replica.delete(index, count));
        assert.equal(replica.toString(), expected);
      }
    }

    const delivery = shuffled([...allOps, ...allOps], random);
    for (const replica of replicas) {
      for (const op of delivery) replica.apply(op);
    }
  }

  const expected = replicas[0]?.toString() as string;
  const expectedLength = Array.from(expected).length;
  for (const replica of replicas) {
    assert.equal(replica.toString(), expected);
    assert.equal(replica.length, expectedLength);
    assert.equal(replica.length, Array.from(replica.toString()).length);
  }
});
