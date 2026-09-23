import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { getStoredToken, type AppRole, type AuthUser } from '@/lib/auth'

type ManagedUser = AuthUser & { is_active: boolean; created_at?: string }
type UserForm = { username: string; full_name: string; role: AppRole; password: string }

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const EMPTY_FORM: UserForm = { username: '', full_name: '', role: 'viewer', password: '' }
const ROLE_INFO: Record<AppRole, { label: string; description: string }> = {
  admin: { label: 'Admin', description: 'Akses penuh, termasuk pengguna dan seluruh data.' },
  staf: { label: 'Staf', description: 'Mengelola data operasional. Tidak mengelola pengguna; izin edit GIS diatur per bidang.' },
  admin_aset: { label: 'Pengelola Master Data', description: 'Melihat dan mengubah Aset, NJOP, KJPP; melihat Peta Aset.' },
  viewer_aset: { label: 'Pembaca Master & Peta', description: 'Hanya melihat Aset, NJOP, KJPP, dan Peta Aset. Tidak bisa mengubah data.' },
  viewer: { label: 'Pembaca Laporan', description: 'Melihat laporan terbatas dan Peta Aset. Tidak mengakses Master Data.' },
  integrasi: { label: 'Integrasi API', description: 'Akses API integrasi; tidak masuk ke halaman aplikasi.' },
}

async function usersRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken()
  const response = await fetch(`${API_BASE}/api/users${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string }
    throw new Error(body.detail || 'Permintaan pengguna gagal')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

function roleLabel(role: AppRole) {
  return ROLE_INFO[role]?.label ?? role
}

const MIN_PASSWORD_LENGTH = 3

export default function AdminUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<ManagedUser | null>(null)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await usersRequest<{ data: ManagedUser[] }>('')
      setUsers(result.data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengguna')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadUsers() }, [loadUsers])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(user: ManagedUser) {
    setEditing(user)
    setForm({ username: user.username, full_name: user.full_name, role: user.role, password: '' })
    setError(null)
    setDialogOpen(true)
  }

  async function saveUser(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        await usersRequest(`/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ username: form.username, full_name: form.full_name, role: form.role }),
        })
      } else {
        await usersRequest('', { method: 'POST', body: JSON.stringify(form) })
      }
      setDialogOpen(false)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengguna')
    } finally {
      setSaving(false)
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      await usersRequest(`/${editing.id}/reset-password`, {
        method: 'POST', body: JSON.stringify({ password: newPassword }),
      })
      setPasswordOpen(false)
      setNewPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset kata sandi')
    } finally {
      setSaving(false)
    }
  }

  async function deactivateUser() {
    if (!deactivateTarget) return
    try {
      await usersRequest(`/${deactivateTarget.id}`, { method: 'DELETE' })
      setDeactivateTarget(null)
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menonaktifkan pengguna')
    }
  }

  async function reactivateUser(user: ManagedUser) {
    try {
      await usersRequest(`/${user.id}`, { method: 'PUT', body: JSON.stringify({ is_active: true }) })
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengaktifkan pengguna')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Kelola Pengguna</h1>
          <p className="mt-1 text-sm text-gray-500">Atur akun dan fungsi aksesnya. Untuk akses lihat saja ke Master Data dan Peta, pilih Pembaca Master & Peta.</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Tambah Pengguna</Button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-lg border border-blue-100 bg-blue-50/50 p-4"><h2 className="text-sm font-semibold text-[#1B4F72]">Fungsi setiap role</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(ROLE_INFO).map(([role, info]) => <div key={role} className="rounded-md border bg-white p-3"><p className="text-sm font-semibold text-gray-900">{info.label}</p><p className="mt-1 text-xs text-gray-600">{info.description}</p></div>)}</div></section>

      <section className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr><th className="px-5 py-3">Pengguna</th><th className="px-5 py-3">Role dan fungsi</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Aksi admin</th></tr>
          </thead>
          <tbody className="divide-y">
            {loading && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-500">Memuat pengguna...</td></tr>}
            {!loading && !error && users.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-500">Belum ada pengguna.</td></tr>}
            {!loading && users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50/70">
                <td className="px-5 py-3"><div className="font-medium text-gray-900">{user.full_name}</div><div className="text-xs text-gray-500">{user.username}</div></td>
                <td className="px-5 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{roleLabel(user.role)}</span><p className="mt-1 max-w-sm text-xs text-gray-500">{ROLE_INFO[user.role]?.description}</p></td>
                <td className="px-5 py-3"><span className={user.is_active ? 'text-xs font-medium text-emerald-700' : 'text-xs font-medium text-gray-500'}>{user.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                <td className="px-5 py-3"><div className="flex justify-end gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(user)}><Pencil size={14} /> Ubah</Button>
                  <Button variant="outline" size="sm" onClick={() => { setEditing(user); setNewPassword(''); setError(null); setPasswordOpen(true) }}><KeyRound size={14} /> Kata sandi</Button>
                  {user.is_active ? <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setDeactivateTarget(user)}><UserX size={14} /> Nonaktifkan</Button> : <Button variant="outline" size="sm" onClick={() => void reactivateUser(user)}><UserCheck size={14} /> Aktifkan</Button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={saveUser} className="space-y-4">
            <DialogHeader><DialogTitle>{editing ? 'Ubah Pengguna' : 'Tambah Pengguna'}</DialogTitle></DialogHeader>
            <div><Label htmlFor="user-full-name">Nama lengkap</Label><Input id="user-full-name" className="mt-1" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required /></div>
            <div><Label htmlFor="user-username">Username</Label><Input id="user-username" className="mt-1" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} minLength={3} maxLength={64} pattern="[A-Za-z0-9._-]+" required /></div>
            <div><Label>Role</Label><Select value={form.role} onValueChange={value => setForm({ ...form, role: value as AppRole })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ROLE_INFO).map(([role, info]) => <SelectItem key={role} value={role}>{info.label}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-gray-500">{ROLE_INFO[form.role].description}</p></div>
            {!editing && <div><Label htmlFor="user-password">Kata sandi</Label><Input id="user-password" type="password" minLength={MIN_PASSWORD_LENGTH} className="mt-1" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /><p className="mt-1 text-xs text-gray-500">Minimal {MIN_PASSWORD_LENGTH} karakter.</p></div>}
            {error && <p className="text-sm text-red-700">{error}</p>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-w-md"><form onSubmit={resetPassword} className="space-y-4"><DialogHeader><DialogTitle>Ganti Kata Sandi</DialogTitle></DialogHeader><p className="text-sm text-gray-500">Tetapkan kata sandi baru untuk {editing?.username}.</p><div><Label htmlFor="reset-password">Kata sandi baru</Label><Input id="reset-password" type="password" minLength={MIN_PASSWORD_LENGTH} className="mt-1" value={newPassword} onChange={e => setNewPassword(e.target.value)} required /><p className="mt-1 text-xs text-gray-500">Minimal {MIN_PASSWORD_LENGTH} karakter.</p></div>{error && <p className="text-sm text-red-700">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>Batal</Button><Button type="submit" disabled={saving}>Ganti kata sandi</Button></DialogFooter></form></DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deactivateTarget} onOpenChange={open => !open && setDeactivateTarget(null)} title="Nonaktifkan pengguna?" description={`Pengguna ${deactivateTarget?.username ?? ''} tidak lagi dapat masuk. Data bisnis tidak dihapus.`} confirmLabel="Nonaktifkan" isDestructive onConfirm={() => void deactivateUser()} />
    </div>
  )
}
