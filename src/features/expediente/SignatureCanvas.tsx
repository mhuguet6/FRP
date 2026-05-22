import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import SignaturePad from 'signature_pad'

export type SignatureCanvasHandle = {
  isEmpty: () => boolean
  clear: () => void
  toBlob: () => Promise<Blob | null>
}

type Props = {
  height?: number
  ariaLabel?: string
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, Props>(
  function SignatureCanvas({ height = 180, ariaLabel = 'Firma' }, ref) {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const padRef = useRef<SignaturePad | null>(null)

    useEffect(() => {
      const canvas = canvasRef.current
      const wrapper = wrapperRef.current
      if (!canvas || !wrapper) return

      const ratio = Math.max(window.devicePixelRatio || 1, 1)

      const resize = () => {
        const w = wrapper.clientWidth
        canvas.width = w * ratio
        canvas.height = height * ratio
        canvas.style.width = `${w}px`
        canvas.style.height = `${height}px`
        const ctx = canvas.getContext('2d')
        ctx?.scale(ratio, ratio)
        padRef.current?.clear()
      }

      resize()
      const pad = new SignaturePad(canvas, {
        penColor: '#0f172a',
        backgroundColor: 'rgba(255,255,255,0)',
        minWidth: 0.8,
        maxWidth: 2.2,
      })
      padRef.current = pad

      const onResize = () => {
        // Mantener firma al redimensionar es complicado. Limpiamos.
        resize()
      }
      window.addEventListener('resize', onResize)
      return () => {
        window.removeEventListener('resize', onResize)
        pad.off()
      }
    }, [height])

    useImperativeHandle(
      ref,
      () => ({
        isEmpty: () => padRef.current?.isEmpty() ?? true,
        clear: () => padRef.current?.clear(),
        toBlob: () =>
          new Promise<Blob | null>((resolve) => {
            const canvas = canvasRef.current
            if (!canvas) return resolve(null)
            if (padRef.current?.isEmpty()) return resolve(null)
            canvas.toBlob((b) => resolve(b), 'image/png')
          }),
      }),
      []
    )

    return (
      <div ref={wrapperRef} className="relative">
        <canvas
          ref={canvasRef}
          aria-label={ariaLabel}
          className="block w-full bg-white border border-dashed border-slate-300 rounded-lg touch-none"
        />
        <div className="text-xs text-slate-400 mt-1">
          Firma con el dedo, ratón o lápiz óptico
        </div>
      </div>
    )
  }
)
