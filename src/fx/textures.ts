import * as THREE from 'three'

/** canvas に描画して CanvasTexture を作る。 */
function makeTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 中心が白く柔らかく減衰する円形グロー。パーティクル汎用。 */
export function glowTexture(size = 128): THREE.CanvasTexture {
  return makeTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.3, 'rgba(255,255,255,0.55)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.12)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

/** 硬めの光点。火花用。 */
export function sparkTexture(size = 64): THREE.CanvasTexture {
  return makeTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.25)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

/** 衝撃波用の薄いリング。 */
export function ringTexture(size = 256): THREE.CanvasTexture {
  return makeTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0.62, 'rgba(255,255,255,0)')
    g.addColorStop(0.78, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.86, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

/** キャラ足元のブロブ影。 */
export function blobShadowTexture(size = 128): THREE.CanvasTexture {
  return makeTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(0,0,0,0.55)')
    g.addColorStop(0.6, 'rgba(0,0,0,0.32)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}

/** 地面の霧・砂煙用のソフトな塊。 */
export function smokeTexture(size = 128): THREE.CanvasTexture {
  return makeTexture(size, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.35)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.16)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
}
