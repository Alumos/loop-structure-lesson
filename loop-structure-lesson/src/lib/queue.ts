import type { Snapshot } from "../../shared/engine";
import { compactSnapshot } from "../../shared/records";
import { api, ApiError } from "./api";
import { uuid } from "./utils";
export type Job = {
  id: string;
  participant: string;
  created: number;
  path: string;
  body: any;
};
let database: Promise<IDBDatabase> | null = null;
function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("moon-classroom-queue", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("jobs", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function transaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("jobs", mode),
      r = fn(tx.objectStore("jobs"));
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = () => reject(tx.error);
  });
}
// A synchronous journal covers the brief interval before IndexedDB commits.
// Reloading during that interval must not discard the last dropped node.
function journal(participant: string): Job[] {
  try {
    return JSON.parse(
      sessionStorage.getItem(`moon-pending:${participant}`) || "[]",
    );
  } catch {
    return [];
  }
}
function writeJournal(participant: string, entries: Job[]) {
  try {
    const key = `moon-pending:${participant}`;
    if (entries.length) sessionStorage.setItem(key, JSON.stringify(entries));
    else sessionStorage.removeItem(key);
  } catch {
    /* IndexedDB remains the primary queue if session storage is unavailable. */
  }
}
async function persistJob(job: Job) {
  await transaction("readwrite", (s) => s.put(job));
  writeJournal(
    job.participant,
    journal(job.participant).filter((j) => j.id !== job.id),
  );
}
async function jobs(participant: string) {
  for (const job of journal(participant)) await persistJob(job);
  return ((await transaction("readonly", (s) => s.getAll())) as Job[])
    .filter((j) => j.participant === participant)
    .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}
let serial = Date.now() * 1000;
export async function enqueue(participant: string, path: string, body: any) {
  const job: Job = { id: uuid(), participant, created: ++serial, path, body };
  writeJournal(participant, [...journal(participant), job]);
  await persistJob(job);
}
// Restore edits not yet uploaded before mounting the workspace after a reload.
export async function pendingSnapshots(
  participant: string,
): Promise<Snapshot[]> {
  return (await jobs(participant))
    .filter((j) => j.path === "/student/events")
    .flatMap((j) => j.body.events || [])
    .filter(
      (e) => !["pointer", "step"].includes(e.kind) && e.snapshot?.activity,
    )
    .map((e) => compactSnapshot(e.snapshot));
}
export async function clearJobs(participant: string) {
  const js = await jobs(participant);
  for (const j of js) await transaction("readwrite", (s) => s.delete(j.id));
}
export function startQueue(
  participant: string,
  notify: (pending: number, error?: string) => void,
  reset: () => void,
  onSynced: () => void,
) {
  let disposed = false,
    busy = false;
  async function flush() {
    if (busy || disposed) return;
    busy = true;
    try {
      let js = await jobs(participant);
      notify(js.length);
      if (js.length > 5000) {
        const pointers = js.filter((j) =>
          j.body.events?.every((e: any) => e.kind === "pointer"),
        );
        for (const j of pointers.slice(0, js.length - 5000))
          await transaction("readwrite", (s) => s.delete(j.id));
        js = await jobs(participant);
      }
      for (let i = 0; i < js.length; i++) {
        if (disposed) break;
        const j = js[i],
          batch = [j];
        let body = j.body;
        if (j.path === "/student/events") {
          while (
            i + 1 < js.length &&
            js[i + 1].path === j.path &&
            batch.length < 30
          )
            batch.push(js[++i]);
          body = {
            events: batch
              .flatMap((v) => v.body.events)
              .filter((e: any) => !["pointer", "step"].includes(e.kind))
              .map((e: any) => ({
                ...e,
                snapshot: compactSnapshot(e.snapshot),
              })),
          };
          if (!body.events.length) {
            for (const v of batch)
              await transaction("readwrite", (s) => s.delete(v.id));
            continue;
          }
        }
        try {
          await api(j.path, body);
        } catch (e) {
          if (e instanceof ApiError && (e.reset || e.status === 401)) {
            await clearJobs(participant);
            reset();
            return;
          }
          if (e instanceof ApiError && [400, 403, 409].includes(e.status)) {
            for (const v of batch)
              await transaction("readwrite", (s) => s.delete(v.id));
            notify(js.length - i - 1, `未同步：${e.message}`);
            continue;
          }
          throw e;
        }
        for (const v of batch)
          await transaction("readwrite", (s) => s.delete(v.id));
      }
      const left = (await jobs(participant)).length;
      notify(left);
      if (js.length && !left) onSynced();
    } catch {
      notify(
        (await jobs(participant).catch(() => [])).length,
        "连接中断，操作已保存在本机，恢复后补传",
      );
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(flush, 1000);
  void flush();
  return {
    flush,
    stop: () => {
      disposed = true;
      clearInterval(timer);
    },
  };
}
