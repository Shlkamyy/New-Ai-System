import test from 'node:test';
import assert from 'node:assert/strict';

const storageMap = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return storageMap.size;
  },
  clear() {
    storageMap.clear();
  },
  getItem(key: string) {
    return storageMap.has(key) ? storageMap.get(key)! : null;
  },
  key(index: number) {
    return Array.from(storageMap.keys())[index] ?? null;
  },
  removeItem(key: string) {
    storageMap.delete(key);
  },
  setItem(key: string, value: string) {
    storageMap.set(key, String(value));
  }
};

const cloudSyncPromise = import('../src/utils/cloudSync');

test('classifyCloudSyncError distinguishes permanent Firestore errors from transient network failures', async () => {
  const { classifyCloudSyncError } = await cloudSyncPromise;

  const permWrapped = new Error(
    JSON.stringify({
      error: 'Missing or insufficient permissions.',
      operationType: 'write',
      path: 'attendance/att_1'
    })
  );
  assert.equal(classifyCloudSyncError(permWrapped).kind, 'permanent');

  const permInvalidArg = Object.assign(new Error('invalid-argument: field exceeds size'), {
    code: 'invalid-argument'
  });
  assert.equal(classifyCloudSyncError(permInvalidArg).kind, 'permanent');

  const transientOffline = Object.assign(new Error('Failed to get document because the client is offline.'), {
    code: 'unavailable'
  });
  assert.equal(classifyCloudSyncError(transientOffline).kind, 'transient');
});

test('pending queue persists attendance ops immediately, notifies listeners, and prevents stale dequeue races', async () => {
  const {
    clearPendingCloudOps,
    enqueuePendingCloudOps,
    dequeuePendingCloudOpIfMatch,
    getPendingCloudOps,
    getPendingAttendanceIds,
    subscribePendingQueueOpsChange
  } = await cloudSyncPromise;

  clearPendingCloudOps();
  assert.equal(getPendingCloudOps().length, 0);

  let observedOpsCount = -1;
  const unsubscribe = subscribePendingQueueOpsChange(ops => {
    observedOpsCount = ops.length;
  });

  const [firstOp] = enqueuePendingCloudOps([
    {
      kind: 'doc_upsert',
      collectionName: 'attendance',
      docId: 'att_u1_2026-10-20_s1',
      data: { id: 'att_u1_2026-10-20_s1', status: 'active' }
    }
  ]);

  assert.deepEqual(getPendingAttendanceIds(), ['att_u1_2026-10-20_s1']);
  assert.ok(storageMap.get('cf_mai_pending_cloud_ops_v1')?.includes('att_u1_2026-10-20_s1'));

  // Enqueue newer state for same key (clockOut overwriting clockIn)
  const [newerOp] = enqueuePendingCloudOps([
    {
      kind: 'doc_upsert',
      collectionName: 'attendance',
      docId: 'att_u1_2026-10-20_s1',
      data: { id: 'att_u1_2026-10-20_s1', status: 'completed', clockOut: '17:00' }
    }
  ]);

  // Attempting to dequeue with stale token must NOT remove the newer op
  dequeuePendingCloudOpIfMatch(firstOp.key, firstOp.token);
  assert.equal(getPendingCloudOps().length, 1);

  // Dequeueing with matching token removes it immediately
  dequeuePendingCloudOpIfMatch(newerOp.key, newerOp.token);
  assert.equal(getPendingCloudOps().length, 0);
  assert.deepEqual(getPendingAttendanceIds(), []);

  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(observedOpsCount, 0);
  unsubscribe();
});
