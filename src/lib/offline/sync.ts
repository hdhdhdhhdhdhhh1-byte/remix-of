import { getDB } from './db'
import { supabase } from '@/integrations/supabase/client'

type QueueItem = {
  local_id?: number
  type: 'upsert_report' | 'delete_report' | 'upsert_entries' | 'delete_entries'
  payload: any
  created_at: string
}

export async function addToQueue(type: QueueItem['type'], payload: any) {
  const db = await getDB()
  await db.add('queue', { type, payload, created_at: new Date().toISOString() } as QueueItem)
  if (navigator.onLine) syncNow()
}

export async function syncNow() {
  if (!navigator.onLine) return
  const db = await getDB()
  const queue = (await db.getAll('queue')) as QueueItem[]
  if (queue.length === 0) return

  console.log(`[SYNC] مزامنة ${queue.length} عملية...`)

  for (const item of queue) {
    try {
      if (item.type === 'upsert_report') {
        await supabase.from('daily_reports').upsert(item.payload, { onConflict: 'id' })
      }
      if (item.type === 'delete_report') {
        await supabase.from('report_entries').delete().eq('report_id', item.payload.id)
        await supabase.from('daily_reports').delete().eq('id', item.payload.id)
      }
      if (item.type === 'upsert_entries') {
        await supabase.from('report_entries').upsert(item.payload)
      }
      if (item.type === 'delete_entries') {
        await supabase.from('report_entries').delete().eq('report_id', item.payload.report_id)
      }
      if (item.local_id) await db.delete('queue', item.local_id)
    } catch (e) {
      console.error('[SYNC] فشل مؤقت، سيعاد لاحقاً', e)
    }
  }
  await pullFromCloud()
}

export async function pullFromCloud() {
  if (!navigator.onLine) return
  try {
    const { data: reports } = await supabase.from('daily_reports').select('*, report_entries(*)').limit(500)
    const { data: persons } = await supabase.from('persons').select('*').eq('active', true)
    const db = await getDB()
    if (persons?.length) {
      const tx = db.transaction('persons', 'readwrite')
      for (const p of persons) await tx.store.put(p)
      await tx.done
    }
    if (reports?.length) {
      const tx = db.transaction(['reports', 'entries'], 'readwrite')
      for (const r of reports as any[]) {
        const { report_entries, ...report } = r
        await tx.objectStore('reports').put(report)
        if (report_entries) for (const e of report_entries) await tx.objectStore('entries').put(e)
      }
      await tx.done
    }
    await db.put('meta', { key: 'last_sync', value: new Date().toISOString() })
  } catch {}
}

// يشتغل تلقائياً عند عودة النت
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncNow())
  setInterval(() => { if (navigator.onLine) syncNow() }, 30000)
}
