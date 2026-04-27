export interface KirimWAParams {
  noWA: string
  pesan: string
}

export interface KirimWAResult {
  status: boolean
  message?: string
  id?: string
}

export async function kirimWA(params: KirimWAParams): Promise<KirimWAResult> {
  const { noWA, pesan } = params
  const token = import.meta.env.VITE_FONNTE_TOKEN

  if (!token || token === 'placeholder_fonnte_token') {
    console.warn('Fonnte token belum dikonfigurasi')
    return { status: false, message: 'Token Fonnte belum dikonfigurasi' }
  }

  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target: noWA, message: pesan }),
    })
    const data = await response.json()
    return data
  } catch (error) {
    console.error('Error kirim WA:', error)
    return { status: false, message: 'Gagal mengirim pesan' }
  }
}
