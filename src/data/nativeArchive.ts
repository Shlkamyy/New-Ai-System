import {
  Patient,
  Appointment,
  Invoice,
  Payment,
  Operation
} from '../types/clinic';

export interface NativeArchiveData {
  patients: Patient[];
  appointments: Appointment[];
  invoices: Invoice[];
  payments: Payment[];
  operations: Operation[];
}

let cachedPromise: Promise<NativeArchiveData> | null = null;
let cachedArchive: NativeArchiveData | null = null;

export function getCachedNativeArchive(): NativeArchiveData | null {
  return cachedArchive;
}

export function loadNativeArchive(): Promise<NativeArchiveData> {
  if (cachedArchive) {
    return Promise.resolve(cachedArchive);
  }
  if (!cachedPromise) {
    cachedPromise = Promise.all([
      import('./nativePatients.json'),
      import('./nativeAppointments.json'),
      import('./nativeInvoices.json'),
      import('./nativePayments.json'),
      import('./nativeOperations.json')
    ]).then(([patMod, apptMod, invMod, payMod, opMod]) => {
      const data: NativeArchiveData = {
        patients: patMod.default as Patient[],
        appointments: apptMod.default as unknown as Appointment[],
        invoices: invMod.default as unknown as Invoice[],
        payments: payMod.default as unknown as Payment[],
        operations: opMod.default as unknown as Operation[]
      };
      cachedArchive = data;
      return data;
    });
  }
  return cachedPromise;
}
