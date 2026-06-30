import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/apiClient'

interface Props {
  open: boolean
  onClose: () => void
  onVerified: () => void
}

export function SupermanCaptchaDialog({ open, onClose, onVerified }: Props) {
  const [challengeId, setChallengeId] = useState('')
  const [imageB64, setImageB64] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)

  const loadCaptcha = () => {
    api.get<{ challenge_id: string; image_base64: string }>('/api/superman/captcha')
      .then(res => { setChallengeId(res.challenge_id); setImageB64(res.image_base64) })
      .catch(e => alert(e.message))
  }

  useEffect(() => { if (open) loadCaptcha() }, [open])

  const handleVerify = async () => {
    setLoading(true)
    try {
      await api.post('/api/superman/captcha/verify', { challenge_id: challengeId, answer })
      onVerified()
      onClose()
    } catch (e: any) {
      alert(e.message ?? 'Captcha salah')
      loadCaptcha()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Captcha Superman</DialogTitle></DialogHeader>
        {imageB64 && <img src={`data:image/png;base64,${imageB64}`} alt="captcha" className="mx-auto border rounded" />}
        <Input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Masukkan captcha" />
        <DialogFooter>
          <Button variant="outline" onClick={loadCaptcha}>Refresh</Button>
          <Button onClick={handleVerify} disabled={loading}>Verifikasi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}