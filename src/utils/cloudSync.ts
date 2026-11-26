import {
  collection,
  deleteDoc,
  doc,
  FieldValue,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  Unsubscribe
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export const ADMIN_OWNER_EMAIL = 'muhammed.shlkamy@gmail.com';

export interface CloudSyncMeta {
  ownerEmail: string;
  allowedEmails: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OverlayDoc<T> {
  id: string;
  isDeleted: boolean;
  payload?: T;
}

// Cache of known server createdAt timestamps keyed by `${collectionName}/${docId}`
const createdAtCache = new Map<string, Timestamp>();

// Per-document write queue to prevent concurrent createdAt races on sequential mutations
const docWriteQueues = new Map<string, Promise<void>>();

function enqueueDocWrite<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = docWriteQueues.get(path) || Promise.resolve();
  const next = previous.then(task, task);
  const tracked = next
    .then(
      () => undefined,
      () => undefined
    )
    .finally(() => {
      if (docWriteQueues.get(path) === tracked) {
        docWriteQueues.delete(path);
      }
    });
  docWriteQueues.set(path, tracked);
  return next;
}

export function sanitizeDocId(rawId: string): string {
  const cleaned = String(rawId || 'doc')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const nonEmpty = cleaned.length > 0 ? cleaned : 'doc_' + Date.now();
  return nonEmpty.slice(0, 128);
}

export function normalizeAllowedEmails(emails: string[] | undefined): string[] {
  const set = new Set<string>([ADMIN_OWNER_EMAIL]);
  (emails || []).forEach(em => {
    const clean = em.trim().toLowerCase();
    if (clean && clean.includes('@') && clean.length <= 120) {
      set.add(clean);
    }
  });
  return Array.from(set).slice(0, 25);
}

export function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value instanceof Date || value instanceof Timestamp || value instanceof FieldValue) {
    return value;
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined && typeof v !== 'function') {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

function stripCloudMeta<T extends object>(raw: T): Omit<T, keyof CloudSyncMeta> {
  const copy = { ...(raw as Record<string, unknown>) };
  delete copy.ownerEmail;
  delete copy.allowedEmails;
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy as Omit<T, keyof CloudSyncMeta>;
}

function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  if (code === 'permission-denied') return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions');
}

function buildOverlayPayloadWithSizeGuard<T extends { id: string }>(
  collectionName: 'patients_sync' | 'appointments_sync' | 'invoices_sync' | 'payments_sync' | 'operations_sync',
  docId: string,
  record: T,
  isDeleted: boolean,
  allowedEmails: string[],
  createdAt: Timestamp | ReturnType<typeof serverTimestamp>,
  updatedAt: ReturnType<typeof serverTimestamp>
): Record<string, unknown> {
  const docPayload: Record<string, unknown> = {
    id: docId,
    isDeleted,
    ownerEmail: ADMIN_OWNER_EMAIL,
    allowedEmails,
    createdAt,
    updatedAt
  };
  if (isDeleted) return docPayload;

  const cleanedRecord = stripUndefinedDeep(record) as unknown as Record<string, unknown>;
  docPayload.payload = cleanedRecord;

  if (collectionName === 'patients_sync') {
    try {
      const approxBytes = JSON.stringify(cleanedRecord).length;
      if (approxBytes > 850_000 && Array.isArray(cleanedRecord.notes)) {
        const strippedNotes = (cleanedRecord.notes as Array<unknown>).map(n => {
          if (n && typeof n === 'object' && typeof (n as Record<string, unknown>).audioDataUrl === 'string') {
            const copy = { ...(n as Record<string, unknown>) };
            delete copy.audioDataUrl;
            return copy;
          }
          return n;
        });
        docPayload.payload = { ...cleanedRecord, notes: strippedNotes };
      }
    } catch {
      // ignore size check failure
    }
  }
  return docPayload;
}

async function fetchDocSmart(collectionName: string, docId: string) {
  const ref = doc(db, collectionName, docId);
  try {
    return await getDocFromServer(ref);
  } catch {
    return await getDoc(ref);
  }
}

async function ensureCreatedAtCacheForDocs(collectionName: string, docIds: string[]): Promise<void> {
  const missing = Array.from(new Set(docIds)).filter(
    id => !createdAtCache.has(`${collectionName}/${id}`)
  );
  if (missing.length === 0) return;

  try {
    if (missing.length <= 15) {
      await Promise.all(
        missing.map(async id => {
          try {
            const snap = await fetchDocSmart(collectionName, id);
            if (snap.exists()) {
              const ts = snap.data()?.createdAt;
              if (ts instanceof Timestamp) {
                createdAtCache.set(`${collectionName}/${id}`, ts);
              }
            }
          } catch {
            // Skip if document doesn't exist or server is unreachable
          }
        })
      );
    } else {
      const q = query(
        collection(db, collectionName),
        where('ownerEmail', '==', ADMIN_OWNER_EMAIL)
      );
      let snap;
      try {
        snap = await getDocsFromServer(q);
      } catch {
        snap = await getDocs(q);
      }
      snap.forEach(docSnap => {
        const ts = docSnap.data()?.createdAt;
        if (ts instanceof Timestamp) {
          createdAtCache.set(`${collectionName}/${docSnap.id}`, ts);
        }
      });
    }
  } catch {
    // Allow batch to continue; existing docs missing cache won't silently fail if unavailable
  }
}

async function resolveTimestampsForWrite(collectionName: string, docId: string) {
  const cacheKey = `${collectionName}/${docId}`;
  const cached = createdAtCache.get(cacheKey);
  if (cached) {
    return {
      isCreate: false,
      createdAt: cached,
      updatedAt: serverTimestamp()
    };
  }
  try {
    const snap = await fetchDocSmart(collectionName, docId);
    if (snap.exists()) {
      const existingCreated = snap.data()?.createdAt;
      if (existingCreated instanceof Timestamp) {
        createdAtCache.set(cacheKey, existingCreated);
        return {
          isCreate: false,
          createdAt: existingCreated,
          updatedAt: serverTimestamp()
        };
      }
    }
  } catch {
    // Proceed as create if read was unavailable before initial write
  }
  return {
    isCreate: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function clampStr(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}

function sanitizeStaffAlertLogData(raw: Record<string, unknown>): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const validStatuses = new Set(['active', 'snoozed', 'resolved', 'dismissed']);
  const validTypes = new Set(['appointment', 'shift_start', 'shift_end', 'test']);

  const out: Record<string, unknown> = {
    id: clampStr(raw.id, 128) || 'sal_alert',
    alertType: validTypes.has(String(raw.alertType || '')) ? String(raw.alertType) : 'appointment',
    targetKey: clampStr(raw.targetKey, 128) || 'alert',
    title: clampStr(raw.title, 200) || 'تنبيه',
    message: clampStr(raw.message, 1000) || '',
    status: validStatuses.has(String(raw.status || '')) ? String(raw.status) : 'active',
    triggeredAt: clampStr(raw.triggeredAt, 64) || nowIso,
    lastUpdatedAt: clampStr(raw.lastUpdatedAt, 64) || nowIso
  };

  const optPatientId = clampStr(raw.patientId, 128);
  if (optPatientId) out.patientId = optPatientId;

  const optPatientName = clampStr(raw.patientName, 160);
  if (optPatientName) out.patientName = optPatientName;

  const optAppointmentId = clampStr(raw.appointmentId, 128);
  if (optAppointmentId) out.appointmentId = optAppointmentId;

  const optAppointmentDate = clampStr(raw.appointmentDate, 24);
  if (optAppointmentDate) out.appointmentDate = optAppointmentDate;

  const optAppointmentTime = clampStr(raw.appointmentTime, 24);
  if (optAppointmentTime) out.appointmentTime = optAppointmentTime;

  const optLastBy = clampStr(raw.lastInteractionBy, 120);
  if (optLastBy) out.lastInteractionBy = optLastBy;

  const optLastById = clampStr(raw.lastInteractionById, 128);
  if (optLastById) out.lastInteractionById = optLastById;

  const optLastLabel = clampStr(raw.lastInteractionLabel, 200);
  if (optLastLabel) out.lastInteractionLabel = optLastLabel;

  if (Array.isArray(raw.targetStaffIds)) {
    out.targetStaffIds = raw.targetStaffIds.map(x => String(x)).slice(0, 50);
  }
  if (Array.isArray(raw.targetStaffNames)) {
    out.targetStaffNames = raw.targetStaffNames.map(x => String(x)).slice(0, 50);
  }
  if (raw.channel === 'website_only' || raw.channel === 'mobile_and_website') {
    out.channel = raw.channel;
  }

  const rawInteractions = Array.isArray(raw.interactions) ? raw.interactions : [];
  out.interactions = rawInteractions
    .filter(item => item && typeof item === 'object')
    .slice(-30)
    .map(item => {
      const rec = { ...(item as Record<string, unknown>) };
      if (typeof rec.id === 'string') rec.id = clampStr(rec.id, 128);
      if (typeof rec.staffId === 'string') rec.staffId = clampStr(rec.staffId, 128);
      if (typeof rec.staffName === 'string') rec.staffName = clampStr(rec.staffName, 120);
      if (typeof rec.actionLabel === 'string') rec.actionLabel = clampStr(rec.actionLabel, 200);
      if (typeof rec.timestamp === 'string') rec.timestamp = clampStr(rec.timestamp, 64);
      return rec;
    });

  return out;
}

function sanitizeAttendanceData(raw: Record<string, unknown>, docId: string): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: clampStr(raw.id, 128) || docId,
    userId: clampStr(raw.userId, 128) || 'unknown',
    userName: clampStr(raw.userName, 120) || 'موظف',
    unitId: clampStr(raw.unitId, 128) || 'unit_1',
    unitName: clampStr(raw.unitName, 120) || 'عيادة',
    date: clampStr(raw.date, 20) || '',
    clockIn: clampStr(raw.clockIn, 16) || '00:00',
    status: raw.status === 'completed' ? 'completed' : 'active'
  };
  if (raw.clockOut !== undefined) {
    const co = clampStr(raw.clockOut, 16);
    if (co) out.clockOut = co;
  }
  if (raw.isManual !== undefined) {
    out.isManual = Boolean(raw.isManual);
  }
  if (raw.manualReason !== undefined) {
    const mr = clampStr(raw.manualReason, 300);
    if (mr) out.manualReason = mr;
  }
  return out;
}

function buildMergedStaffAlertLog(
  existingRaw: Record<string, unknown>,
  incomingRaw: Record<string, unknown>,
  allowedEmails: string[]
): { skipWrite: boolean; payload?: Record<string, unknown> } {
  const incoming = sanitizeStaffAlertLogData(incomingRaw);
  const existingSanitized = sanitizeStaffAlertLogData(existingRaw);
  const incomingInteractions = Array.isArray(incoming.interactions)
    ? (incoming.interactions as Array<Record<string, unknown>>)
    : [];
  const existingInteractions = Array.isArray(existingSanitized.interactions)
    ? (existingSanitized.interactions as Array<Record<string, unknown>>)
    : [];

  const isOnlyInitialTrigger =
    incoming.status === 'active' &&
    incomingInteractions.length <= 1 &&
    (incomingInteractions.length === 0 || incomingInteractions[0]?.action === 'triggered');

  if (isOnlyInitialTrigger) {
    return { skipWrite: true };
  }

  const mergedInteractionsMap = new Map<string, Record<string, unknown>>();
  existingInteractions.forEach((it, idx) => {
    const key = typeof it?.id === 'string' && it.id ? it.id : `existing_${idx}`;
    mergedInteractionsMap.set(key, it);
  });
  incomingInteractions.forEach((it, idx) => {
    const key = typeof it?.id === 'string' && it.id ? it.id : `incoming_${idx}`;
    mergedInteractionsMap.set(key, it);
  });
  const mergedInteractions = Array.from(mergedInteractionsMap.values()).slice(-30);

  const existingStatus = String(existingSanitized.status || 'active');
  const incomingStatus = String(incoming.status || 'active');
  const existingIsTerminal = existingStatus === 'resolved' || existingStatus === 'dismissed';
  const incomingIsTerminal = incomingStatus === 'resolved' || incomingStatus === 'dismissed';

  const resolvedStatus = existingIsTerminal && !incomingIsTerminal ? existingStatus : incomingStatus;

  const existingLastUpdated = String(existingSanitized.lastUpdatedAt || '');
  const incomingLastUpdated = String(incoming.lastUpdatedAt || '');
  const useIncomingMeta = !existingLastUpdated || incomingLastUpdated >= existingLastUpdated;

  const merged: Record<string, unknown> = {
    // Preserve immutable identity & schema fields from existing server document
    id: existingRaw.id,
    alertType: existingRaw.alertType,
    targetKey: existingRaw.targetKey,
    triggeredAt: existingRaw.triggeredAt,
    // Mutable fields (strictly clamped to Firestore rule limits)
    title: clampStr(incoming.title || existingSanitized.title || '', 200) || '',
    message: clampStr(incoming.message || existingSanitized.message || '', 1000) || '',
    status: resolvedStatus,
    lastUpdatedAt: clampStr(
      useIncomingMeta ? incomingLastUpdated || existingLastUpdated : existingLastUpdated,
      64
    ) || new Date().toISOString(),
    interactions: mergedInteractions,
    ownerEmail: existingRaw.ownerEmail || ADMIN_OWNER_EMAIL,
    allowedEmails: normalizeAllowedEmails(allowedEmails)
  };

  // Preserve immutable optional fields strictly as stored on existing server doc
  const immutableOptionalKeys = [
    'patientId',
    'patientName',
    'appointmentId',
    'appointmentDate',
    'appointmentTime'
  ];
  for (const k of immutableOptionalKeys) {
    if (existingRaw[k] !== undefined) {
      merged[k] = existingRaw[k];
    }
  }

  // Mutable optional fields
  const nextTargetIds = incoming.targetStaffIds ?? existingSanitized.targetStaffIds;
  if (Array.isArray(nextTargetIds)) merged.targetStaffIds = nextTargetIds.map(x => String(x)).slice(0, 50);
  const nextTargetNames = incoming.targetStaffNames ?? existingSanitized.targetStaffNames;
  if (Array.isArray(nextTargetNames)) merged.targetStaffNames = nextTargetNames.map(x => String(x)).slice(0, 50);
  const nextChannel = incoming.channel ?? existingSanitized.channel;
  if (nextChannel === 'website_only' || nextChannel === 'mobile_and_website') merged.channel = nextChannel;

  const lastBy = useIncomingMeta
    ? incoming.lastInteractionBy ?? existingSanitized.lastInteractionBy
    : existingSanitized.lastInteractionBy ?? incoming.lastInteractionBy;
  if (typeof lastBy === 'string' && lastBy) merged.lastInteractionBy = clampStr(lastBy, 120);

  const lastById = useIncomingMeta
    ? incoming.lastInteractionById ?? existingSanitized.lastInteractionById
    : existingSanitized.lastInteractionById ?? incoming.lastInteractionById;
  if (typeof lastById === 'string' && lastById) merged.lastInteractionById = clampStr(lastById, 128);

  const lastLabel = useIncomingMeta
    ? incoming.lastInteractionLabel ?? existingSanitized.lastInteractionLabel
    : existingSanitized.lastInteractionLabel ?? incoming.lastInteractionLabel;
  if (typeof lastLabel === 'string' && lastLabel) merged.lastInteractionLabel = clampStr(lastLabel, 200);

  return {
    skipWrite: false,
    payload: {
      ...stripUndefinedDeep(merged),
      createdAt: existingRaw.createdAt,
      updatedAt: serverTimestamp()
    }
  };
}

export async function upsertCloudDoc<T extends object>(
  collectionName: string,
  rawId: string,
  data: T,
  allowedEmails: string[]
): Promise<void> {
  const docId = sanitizeDocId(rawId);
  const path = `${collectionName}/${docId}`;
  return enqueueDocWrite(path, async () => {
    const cleanDataRaw = stripUndefinedDeep(stripCloudMeta(data));
    const cleanData =
      collectionName === 'staff_alert_logs'
        ? sanitizeStaffAlertLogData({ ...cleanDataRaw, id: docId })
        : collectionName === 'attendance'
        ? sanitizeAttendanceData(cleanDataRaw as Record<string, unknown>, docId)
        : cleanDataRaw;

    try {
      if (collectionName === 'staff_alert_logs') {
        try {
          const existingSnap = await fetchDocSmart(collectionName, docId);
          if (existingSnap.exists()) {
            const existingRaw = existingSnap.data();
            if (existingRaw?.createdAt instanceof Timestamp) {
              createdAtCache.set(path, existingRaw.createdAt);
              const { skipWrite, payload } = buildMergedStaffAlertLog(
                existingRaw as Record<string, unknown>,
                cleanData,
                allowedEmails
              );
              if (skipWrite || !payload) return;
              await setDoc(doc(db, collectionName, docId), payload);
              return;
            }
          }
        } catch {
          // Proceed with standard path and recover on write catch if server doc actually exists
        }
      }

      const { isCreate, createdAt, updatedAt } = await resolveTimestampsForWrite(collectionName, docId);
      const payload = {
        ...cleanData,
        ownerEmail: ADMIN_OWNER_EMAIL,
        allowedEmails: normalizeAllowedEmails(allowedEmails),
        createdAt,
        updatedAt
      };
      await setDoc(doc(db, collectionName, docId), payload);
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        try {
          const serverSnap = await getDocFromServer(doc(db, collectionName, docId));
          if (serverSnap.exists()) {
            const existingRaw = serverSnap.data();
            const existingCreated = existingRaw?.createdAt;
            if (existingCreated instanceof Timestamp) {
              createdAtCache.set(path, existingCreated);
            }
            if (collectionName === 'staff_alert_logs' && existingCreated instanceof Timestamp) {
              const { skipWrite, payload } = buildMergedStaffAlertLog(
                existingRaw as Record<string, unknown>,
                cleanData,
                allowedEmails
              );
              if (skipWrite || !payload) return;
              await setDoc(doc(db, collectionName, docId), payload);
              return;
            }
            if (existingCreated instanceof Timestamp) {
              const retryPayload = {
                ...cleanData,
                ownerEmail:
                  typeof existingRaw?.ownerEmail === 'string' && existingRaw.ownerEmail
                    ? existingRaw.ownerEmail
                    : ADMIN_OWNER_EMAIL,
                allowedEmails: normalizeAllowedEmails(allowedEmails),
                createdAt: existingCreated,
                updatedAt: serverTimestamp()
              };
              await setDoc(doc(db, collectionName, docId), retryPayload);
              return;
            }
          }
        } catch (retryError) {
          handleFirestoreError(retryError, OperationType.WRITE, path);
        }
      }
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

export async function deleteCloudDoc(collectionName: string, rawId: string): Promise<void> {
  const docId = sanitizeDocId(rawId);
  const path = `${collectionName}/${docId}`;
  return enqueueDocWrite(path, async () => {
    try {
      await deleteDoc(doc(db, collectionName, docId));
      createdAtCache.delete(path);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  });
}

export async function upsertSyncOverlay<T extends { id: string }>(
  collectionName: 'patients_sync' | 'appointments_sync' | 'invoices_sync' | 'payments_sync' | 'operations_sync',
  record: T,
  isDeleted: boolean,
  allowedEmails: string[]
): Promise<void> {
  const docId = sanitizeDocId(record.id);
  const path = `${collectionName}/${docId}`;
  const normalized = normalizeAllowedEmails(allowedEmails);
  return enqueueDocWrite(path, async () => {
    try {
      const { isCreate, createdAt, updatedAt } = await resolveTimestampsForWrite(collectionName, docId);
      const docPayload = buildOverlayPayloadWithSizeGuard(
        collectionName,
        docId,
        record,
        isDeleted,
        normalized,
        createdAt,
        updatedAt
      );
      await setDoc(doc(db, collectionName, docId), docPayload);
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        try {
          const serverSnap = await getDocFromServer(doc(db, collectionName, docId));
          if (serverSnap.exists()) {
            const existingCreated = serverSnap.data()?.createdAt;
            if (existingCreated instanceof Timestamp) {
              createdAtCache.set(path, existingCreated);
              const retryPayload = buildOverlayPayloadWithSizeGuard(
                collectionName,
                docId,
                record,
                isDeleted,
                normalized,
                existingCreated,
                serverTimestamp()
              );
              await setDoc(doc(db, collectionName, docId), retryPayload);
              return;
            }
          }
        } catch (retryError) {
          handleFirestoreError(retryError, OperationType.WRITE, path);
        }
      }
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

export async function batchUpsertSyncOverlay<T extends { id: string }>(
  collectionName: 'patients_sync' | 'appointments_sync' | 'invoices_sync' | 'payments_sync' | 'operations_sync',
  records: Array<{ record: T; isDeleted: boolean }>,
  allowedEmails: string[]
): Promise<void> {
  if (!records || records.length === 0) return;
  const normalized = normalizeAllowedEmails(allowedEmails);
  try {
    const allDocIds = records.map(r => sanitizeDocId(r.record.id));
    await ensureCreatedAtCacheForDocs(collectionName, allDocIds);

    for (let i = 0; i < records.length; i += 200) {
      const chunk = records.slice(i, i + 200);
      const batch = writeBatch(db);
      const newlyCreatedIds: string[] = [];
      for (const item of chunk) {
        const docId = sanitizeDocId(item.record.id);
        const cacheKey = `${collectionName}/${docId}`;
        const existingCreated = createdAtCache.get(cacheKey);
        if (!existingCreated) {
          newlyCreatedIds.push(docId);
        }
        const docPayload = buildOverlayPayloadWithSizeGuard(
          collectionName,
          docId,
          item.record,
          item.isDeleted,
          normalized,
          existingCreated || serverTimestamp(),
          serverTimestamp()
        );
        batch.set(doc(db, collectionName, docId), docPayload);
      }
      try {
        await batch.commit();
        if (newlyCreatedIds.length > 0) {
          await ensureCreatedAtCacheForDocs(collectionName, newlyCreatedIds);
        }
      } catch {
        // Isolate bad/racy documents cleanly so all valid documents in the chunk still land
        let firstFailure: unknown = null;
        for (const item of chunk) {
          try {
            await upsertSyncOverlay(collectionName, item.record, item.isDeleted, normalized);
          } catch (singleErr) {
            if (!firstFailure) firstFailure = singleErr;
          }
        }
        if (firstFailure) {
          throw firstFailure;
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, collectionName);
  }
}

export async function clearCloudOverlayCollection(
  collectionName: 'patients_sync' | 'appointments_sync' | 'invoices_sync' | 'payments_sync' | 'operations_sync',
  _userEmail?: string
): Promise<void> {
  try {
    const q = query(
      collection(db, collectionName),
      where('ownerEmail', '==', ADMIN_OWNER_EMAIL)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach(d => {
        batch.delete(d.ref);
        createdAtCache.delete(`${collectionName}/${d.id}`);
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, collectionName);
  }
}

export async function fetchCollectionFromServer<T extends object>(
  collectionName: string
): Promise<T[]> {
  const q = query(
    collection(db, collectionName),
    where('ownerEmail', '==', ADMIN_OWNER_EMAIL)
  );
  const snapshot = await getDocsFromServer(q);
  const items: T[] = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data?.createdAt instanceof Timestamp) {
      createdAtCache.set(`${collectionName}/${docSnap.id}`, data.createdAt);
    }
    items.push(stripCloudMeta(data) as T);
  });
  return items;
}

export function subscribeCollection<T extends object>(
  collectionName: string,
  _userEmail: string,
  onData: (items: T[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, collectionName),
    where('ownerEmail', '==', ADMIN_OWNER_EMAIL)
  );
  let hasEmittedInitial = false;
  return onSnapshot(
    q,
    snapshot => {
      const changes = snapshot.docChanges();
      if (hasEmittedInitial && changes.length === 0) {
        snapshot.forEach(docSnap => {
          const ts = docSnap.data()?.createdAt;
          if (ts instanceof Timestamp) {
            createdAtCache.set(`${collectionName}/${docSnap.id}`, ts);
          }
        });
        return;
      }
      hasEmittedInitial = true;
      const items: T[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data?.createdAt instanceof Timestamp) {
          createdAtCache.set(`${collectionName}/${docSnap.id}`, data.createdAt);
        }
        items.push(stripCloudMeta(data) as T);
      });
      onData(items);
    },
    error => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionName);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeOverlayCollection<T extends { id: string }>(
  collectionName: 'patients_sync' | 'appointments_sync' | 'invoices_sync' | 'payments_sync' | 'operations_sync',
  _userEmail: string,
  onData: (overlays: OverlayDoc<T>[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, collectionName),
    where('ownerEmail', '==', ADMIN_OWNER_EMAIL)
  );
  let hasEmittedInitial = false;
  return onSnapshot(
    q,
    snapshot => {
      const changes = snapshot.docChanges();
      if (hasEmittedInitial && changes.length === 0) {
        snapshot.forEach(docSnap => {
          const ts = docSnap.data()?.createdAt;
          if (ts instanceof Timestamp) {
            createdAtCache.set(`${collectionName}/${docSnap.id}`, ts);
          }
        });
        return;
      }
      hasEmittedInitial = true;
      const overlays: OverlayDoc<T>[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data?.createdAt instanceof Timestamp) {
          createdAtCache.set(`${collectionName}/${docSnap.id}`, data.createdAt);
        }
        overlays.push({
          id: docSnap.id,
          isDeleted: Boolean(data?.isDeleted),
          payload: data?.payload as T | undefined
        });
      });
      onData(overlays);
    },
    error => {
      try {
        handleFirestoreError(error, OperationType.LIST, collectionName);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function mergeSyncOverlay<T extends { id: string }>(
  baseList: T[],
  overlays: OverlayDoc<T>[]
): T[] {
  if (!overlays || overlays.length === 0) return baseList;

  const byRawId = new Map<string, OverlayDoc<T>>();
  overlays.forEach(ov => {
    const rawId = ov.payload?.id || ov.id;
    byRawId.set(rawId, ov);
    byRawId.set(ov.id, ov);
  });

  const baseIds = new Set<string>();
  const mergedBase: T[] = [];

  for (const item of baseList) {
    baseIds.add(item.id);
    const safe = sanitizeDocId(item.id);
    const ov = byRawId.get(item.id) || byRawId.get(safe);
    if (ov) {
      if (ov.isDeleted) continue;
      if (ov.payload) {
        mergedBase.push(ov.payload);
        continue;
      }
    }
    mergedBase.push(item);
  }

  const additions: T[] = [];
  for (const ov of overlays) {
    if (ov.isDeleted || !ov.payload) continue;
    const rawId = ov.payload.id || ov.id;
    if (!baseIds.has(rawId)) {
      additions.push(ov.payload);
    }
  }

  // Put newest additions first (descending createdAt if available)
  additions.sort((a, b) => {
    const ca = String((a as Record<string, unknown>).createdAt || (a as Record<string, unknown>).date || '');
    const cb = String((b as Record<string, unknown>).createdAt || (b as Record<string, unknown>).date || '');
    return cb.localeCompare(ca);
  });

  return additions.length > 0 ? [...additions, ...mergedBase] : mergedBase;
}

export async function checkCloudInitialized(): Promise<{
  initialized: boolean;
  allowedEmails: string[];
}> {
  const snap = await getDocFromServer(doc(db, 'clinic_config', 'default'));
  if (snap.exists()) {
    const data = snap.data();
    if (data?.createdAt instanceof Timestamp) {
      createdAtCache.set('clinic_config/default', data.createdAt);
    }
    const allowed = Array.isArray(data?.allowedEmails)
      ? (data.allowedEmails as string[])
      : [ADMIN_OWNER_EMAIL];
    return { initialized: true, allowedEmails: allowed };
  }
  return { initialized: false, allowedEmails: [ADMIN_OWNER_EMAIL] };
}

export async function seedCollectionBatch<T extends { id: string }>(
  collectionName: string,
  items: T[],
  allowedEmails: string[]
): Promise<void> {
  if (!items || items.length === 0) return;
  const normalized = normalizeAllowedEmails(allowedEmails);
  try {
    const allDocIds = items.map(item => sanitizeDocId(item.id));
    await ensureCreatedAtCacheForDocs(collectionName, allDocIds);

    for (let i = 0; i < items.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = items.slice(i, i + 200);
      const newlyCreatedIds: string[] = [];
      chunk.forEach(item => {
        const docId = sanitizeDocId(item.id);
        const cacheKey = `${collectionName}/${docId}`;
        const existingCreated = createdAtCache.get(cacheKey);
        if (!existingCreated) {
          newlyCreatedIds.push(docId);
        }
        const ref = doc(db, collectionName, docId);
        const cleanItem = stripUndefinedDeep(stripCloudMeta(item as unknown as Record<string, unknown>));
        batch.set(ref, {
          ...cleanItem,
          id: docId,
          ownerEmail: ADMIN_OWNER_EMAIL,
          allowedEmails: normalized,
          createdAt: existingCreated || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      try {
        await batch.commit();
        if (newlyCreatedIds.length > 0) {
          await ensureCreatedAtCacheForDocs(collectionName, newlyCreatedIds);
        }
      } catch {
        let firstFailure: unknown = null;
        for (const item of chunk) {
          try {
            const docId = sanitizeDocId(item.id);
            await upsertCloudDoc(collectionName, docId, { ...item, id: docId }, normalized);
          } catch (singleErr) {
            if (!firstFailure) firstFailure = singleErr;
          }
        }
        if (firstFailure) {
          throw firstFailure;
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, collectionName);
  }
}

// ============================================================================
// Persistent Local Pending Cloud Queue
// Survives page refreshes, offline periods, and delayed Firebase Anonymous Auth
// ============================================================================

export type OverlayCollectionName =
  | 'patients_sync'
  | 'appointments_sync'
  | 'invoices_sync'
  | 'payments_sync'
  | 'operations_sync';

export interface PendingOverlayOp {
  key: string;
  kind: 'overlay';
  collectionName: OverlayCollectionName;
  docId: string;
  record: { id: string } & Record<string, unknown>;
  isDeleted: boolean;
  token: number;
  queuedAt: number;
}

export interface PendingDocUpsertOp {
  key: string;
  kind: 'doc_upsert';
  collectionName: string;
  docId: string;
  data: Record<string, unknown>;
  token: number;
  queuedAt: number;
}

export interface PendingDocDeleteOp {
  key: string;
  kind: 'doc_delete';
  collectionName: string;
  docId: string;
  token: number;
  queuedAt: number;
}

export type PendingCloudOp = PendingOverlayOp | PendingDocUpsertOp | PendingDocDeleteOp;

export type PendingCloudOpInput =
  | {
      kind: 'overlay';
      collectionName: OverlayCollectionName;
      record: { id: string } & object;
      isDeleted: boolean;
    }
  | {
      kind: 'doc_upsert';
      collectionName: string;
      docId: string;
      data: Record<string, unknown>;
    }
  | {
      kind: 'doc_delete';
      collectionName: string;
      docId: string;
    };

const PENDING_QUEUE_STORAGE_KEY = 'cf_mai_pending_cloud_ops_v1';
let tokenSequence = 0;
const queueListeners = new Set<(count: number) => void>();
let pendingQueueCache: PendingCloudOp[] | null = null;
let queueStorageDirty = false;
let queuePersistTimer: ReturnType<typeof setTimeout> | null = null;
let queueNotifyTimer: ReturnType<typeof setTimeout> | null = null;
let lastNotifiedCount = -1;

function nextQueueToken(): number {
  tokenSequence = (tokenSequence + 1) % 1000;
  return Date.now() * 1000 + tokenSequence;
}

function notifyPendingQueueListeners(count: number): void {
  if (lastNotifiedCount === count) return;
  lastNotifiedCount = count;
  queueListeners.forEach(listener => {
    try {
      listener(count);
    } catch {
      // ignore listener errors
    }
  });
}

function schedulePendingQueueNotify(prevCount: number, nextCount: number): void {
  if (prevCount === nextCount) return;
  // Notify immediately when transitioning 0 <-> >0 so the top banner shows/clears without delay
  if (nextCount === 0 || prevCount === 0) {
    if (queueNotifyTimer !== null) {
      clearTimeout(queueNotifyTimer);
      queueNotifyTimer = null;
    }
    notifyPendingQueueListeners(nextCount);
    return;
  }
  if (queueNotifyTimer !== null) return;
  queueNotifyTimer = setTimeout(() => {
    queueNotifyTimer = null;
    notifyPendingQueueListeners(readPendingQueue().length);
  }, 300);
}

function readPendingQueue(): PendingCloudOp[] {
  if (pendingQueueCache !== null) return pendingQueueCache;
  if (typeof localStorage === 'undefined') {
    pendingQueueCache = [];
    return pendingQueueCache;
  }
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_STORAGE_KEY);
    if (!raw) {
      pendingQueueCache = [];
      return pendingQueueCache;
    }
    const parsed = JSON.parse(raw);
    pendingQueueCache = Array.isArray(parsed) ? (parsed as PendingCloudOp[]) : [];
    return pendingQueueCache;
  } catch {
    pendingQueueCache = [];
    return pendingQueueCache;
  }
}

function shrinkOpForQuota(op: PendingCloudOp): PendingCloudOp {
  if (op.kind === 'overlay' && !op.isDeleted && op.collectionName === 'patients_sync') {
    const notes = Array.isArray(op.record.notes) ? op.record.notes : null;
    if (notes) {
      const strippedNotes = notes.map(n => {
        if (n && typeof n === 'object' && typeof (n as Record<string, unknown>).audioDataUrl === 'string') {
          const copy = { ...(n as Record<string, unknown>) };
          delete copy.audioDataUrl;
          return copy;
        }
        return n;
      });
      return {
        ...op,
        record: { ...op.record, notes: strippedNotes }
      };
    }
  }
  return op;
}

function persistQueueToLocalStorageNow(ops: PendingCloudOp[]): void {
  queueStorageDirty = false;
  if (typeof localStorage === 'undefined') return;
  try {
    if (ops.length === 0) {
      localStorage.removeItem(PENDING_QUEUE_STORAGE_KEY);
    } else {
      localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(ops));
    }
  } catch {
    // Drop oldest non-clinical audit logs first, then retry with shrunk ops
    try {
      const withoutOldAudit = ops.filter(op => op.collectionName !== 'audit_logs');
      const trimmed = withoutOldAudit.map(shrinkOpForQuota);
      pendingQueueCache = trimmed;
      localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(trimmed));
      notifyPendingQueueListeners(trimmed.length);
    } catch {
      try {
        const recent = ops.slice(-100).map(shrinkOpForQuota);
        pendingQueueCache = recent;
        localStorage.setItem(PENDING_QUEUE_STORAGE_KEY, JSON.stringify(recent));
        notifyPendingQueueListeners(recent.length);
      } catch {
        // ignore unrecoverable quota failure
      }
    }
  }
}

export function flushPendingQueuePersistenceNow(): void {
  if (queuePersistTimer !== null) {
    clearTimeout(queuePersistTimer);
    queuePersistTimer = null;
  }
  if (!queueStorageDirty || pendingQueueCache === null) return;
  persistQueueToLocalStorageNow(pendingQueueCache);
}

function writePendingQueue(ops: PendingCloudOp[], options?: { immediatePersist?: boolean }): void {
  const prevCount = pendingQueueCache !== null ? pendingQueueCache.length : -1;
  pendingQueueCache = ops;
  queueStorageDirty = true;

  if (options?.immediatePersist || ops.length === 0) {
    flushPendingQueuePersistenceNow();
  } else if (queuePersistTimer === null) {
    queuePersistTimer = setTimeout(() => {
      queuePersistTimer = null;
      if (queueStorageDirty && pendingQueueCache !== null) {
        persistQueueToLocalStorageNow(pendingQueueCache);
      }
    }, 180);
  }

  schedulePendingQueueNotify(prevCount, ops.length);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === PENDING_QUEUE_STORAGE_KEY) {
      pendingQueueCache = null;
      queueStorageDirty = false;
      notifyPendingQueueListeners(readPendingQueue().length);
    }
  });
  window.addEventListener('pagehide', flushPendingQueuePersistenceNow);
  window.addEventListener('beforeunload', flushPendingQueuePersistenceNow);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushPendingQueuePersistenceNow();
  });
}

export function getPendingCloudOps(): PendingCloudOp[] {
  return [...readPendingQueue()];
}

export function getPendingCloudCount(): number {
  return readPendingQueue().length;
}

export function subscribePendingQueueChange(listener: (count: number) => void): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}

export function enqueuePendingCloudOps(inputs: PendingCloudOpInput[]): PendingCloudOp[] {
  if (!inputs || inputs.length === 0) return [];
  const current = [...readPendingQueue()];
  const byKey = new Map<string, number>();
  current.forEach((op, idx) => byKey.set(op.key, idx));

  const createdOps: PendingCloudOp[] = [];
  const now = Date.now();

  for (const input of inputs) {
    const token = nextQueueToken();
    let op: PendingCloudOp;
    if (input.kind === 'overlay') {
      const docId = sanitizeDocId(input.record.id);
      const key = `${input.collectionName}/${docId}`;
      op = {
        key,
        kind: 'overlay',
        collectionName: input.collectionName,
        docId,
        record: stripUndefinedDeep(input.record as unknown as Record<string, unknown>) as { id: string } & Record<string, unknown>,
        isDeleted: input.isDeleted,
        token,
        queuedAt: now
      };
    } else if (input.kind === 'doc_upsert') {
      const docId = sanitizeDocId(input.docId);
      const key = `${input.collectionName}/${docId}`;
      op = {
        key,
        kind: 'doc_upsert',
        collectionName: input.collectionName,
        docId,
        data: stripUndefinedDeep(stripCloudMeta(input.data)) as Record<string, unknown>,
        token,
        queuedAt: now
      };
    } else {
      const docId = sanitizeDocId(input.docId);
      const key = `${input.collectionName}/${docId}`;
      op = {
        key,
        kind: 'doc_delete',
        collectionName: input.collectionName,
        docId,
        token,
        queuedAt: now
      };
    }

    const existingIdx = byKey.get(op.key);
    if (existingIdx !== undefined) {
      current[existingIdx] = op;
    } else {
      byKey.set(op.key, current.length);
      current.push(op);
    }
    createdOps.push(op);
  }

  writePendingQueue(current, { immediatePersist: current.length <= 10 });
  return createdOps;
}

export function dequeuePendingCloudOpIfMatch(key: string, token: number): void {
  const existing = readPendingQueue();
  const idx = existing.findIndex(op => op.key === key && op.token === token);
  if (idx === -1) return;
  const current = [...existing];
  current.splice(idx, 1);
  writePendingQueue(current);
}

export function dequeuePendingCloudOpsBatch(entries: Array<{ key: string; token: number }>): void {
  if (!entries || entries.length === 0) return;
  const existing = readPendingQueue();
  if (existing.length === 0) return;
  const tokenByKey = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    tokenByKey.set(entries[i].key, entries[i].token);
  }
  const next = existing.filter(op => tokenByKey.get(op.key) !== op.token);
  if (next.length !== existing.length) {
    writePendingQueue(next);
  }
}

export function clearPendingCloudOps(): void {
  writePendingQueue([], { immediatePersist: true });
}

export function removePendingCloudOpsByPredicate(predicate: (op: PendingCloudOp) => boolean): number {
  const existing = readPendingQueue();
  if (existing.length === 0) return 0;
  const next = existing.filter(op => !predicate(op));
  const removed = existing.length - next.length;
  if (removed > 0) {
    writePendingQueue(next, { immediatePersist: true });
  }
  return removed;
}

export function applyPendingOverlayOps<T extends { id: string }>(
  collectionName: OverlayCollectionName,
  overlays: OverlayDoc<T>[]
): OverlayDoc<T>[] {
  const pending = readPendingQueue().filter(
    (op): op is PendingOverlayOp => op.kind === 'overlay' && op.collectionName === collectionName
  );
  if (pending.length === 0) return overlays;

  const result = [...overlays];
  const indexByDocId = new Map<string, number>();
  result.forEach((ov, idx) => {
    indexByDocId.set(ov.id, idx);
    if (ov.payload?.id) {
      indexByDocId.set(sanitizeDocId(ov.payload.id), idx);
    }
  });

  for (const op of pending) {
    const nextOverlay: OverlayDoc<T> = {
      id: op.docId,
      isDeleted: op.isDeleted,
      ...(op.isDeleted ? {} : { payload: op.record as unknown as T })
    };
    const existingIdx = indexByDocId.get(op.docId);
    if (existingIdx !== undefined) {
      result[existingIdx] = nextOverlay;
    } else {
      indexByDocId.set(op.docId, result.length);
      result.push(nextOverlay);
    }
  }
  return result;
}

export function applyPendingOverlayRecords<T extends { id: string }>(
  collectionName: OverlayCollectionName,
  records: T[]
): T[] {
  const pending = readPendingQueue().filter(
    (op): op is PendingOverlayOp => op.kind === 'overlay' && op.collectionName === collectionName
  );
  if (pending.length === 0) return records;

  const syntheticOverlays: OverlayDoc<T>[] = pending.map(op => ({
    id: op.docId,
    isDeleted: op.isDeleted,
    ...(op.isDeleted ? {} : { payload: op.record as unknown as T })
  }));
  return mergeSyncOverlay(records, syntheticOverlays);
}

export function applyPendingDocOps<T extends { id?: string }>(
  collectionName: string,
  items: T[]
): T[] {
  const pending = readPendingQueue().filter(
    op => (op.kind === 'doc_upsert' || op.kind === 'doc_delete') && op.collectionName === collectionName
  );
  if (pending.length === 0) return items;

  const deleteIds = new Set<string>();
  const upserts = new Map<string, T>();
  for (const op of pending) {
    if (op.kind === 'doc_delete') {
      deleteIds.add(op.docId);
      upserts.delete(op.docId);
    } else if (op.kind === 'doc_upsert') {
      deleteIds.delete(op.docId);
      upserts.set(op.docId, op.data as unknown as T);
    }
  }

  const result: T[] = [];
  const seenIds = new Set<string>();
  for (const item of items) {
    const rawId = item?.id ? sanitizeDocId(String(item.id)) : '';
    if (rawId && deleteIds.has(rawId)) continue;
    if (rawId && upserts.has(rawId)) {
      result.push(upserts.get(rawId)!);
      seenIds.add(rawId);
      continue;
    }
    result.push(item);
    if (rawId) seenIds.add(rawId);
  }

  upserts.forEach((docData, docId) => {
    if (!seenIds.has(docId)) {
      result.unshift(docData);
    }
  });

  return result;
}

export function applyPendingClinicConfig(
  cfg: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const pending = readPendingQueue().find(
    (op): op is PendingDocUpsertOp =>
      op.kind === 'doc_upsert' && op.collectionName === 'clinic_config' && op.docId === 'default'
  );
  if (!pending) return cfg;
  return { ...(cfg || {}), ...pending.data };
}

