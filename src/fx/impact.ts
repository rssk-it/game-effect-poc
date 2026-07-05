import * as THREE from 'three'
import gsap from 'gsap'
import { glowTexture, sparkTexture } from './textures'
import { FxManager, ParticleBurst } from './particles'
import { isWireframeOn } from './wire-state'

let glowTex: THREE.Texture | null = null
let sparkTex: THREE.Texture | null = null

function textures() {
  glowTex ??= glowTexture()
  sparkTex ??= sparkTexture()
  return { glowTex, sparkTex }
}

/** 一瞬膨らんで消える光球。 */
export function glowPop(
  scene: THREE.Scene,
  pos: THREE.Vector3,
  color: THREE.ColorRepresentation = 0xffffff,
  scale = 2.2,
  duration = 0.28,
): void {
  const { glowTex } = textures()
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  sprite.material.visible = !isWireframeOn() // ワイヤー確認中は発光を出さない
  sprite.position.copy(pos)
  sprite.scale.setScalar(scale * 0.3)
  sprite.renderOrder = 6
  scene.add(sprite)
  gsap.to(sprite.scale, { x: scale, y: scale, duration, ease: 'power3.out' })
  gsap.to(sprite.material, {
    opacity: 0,
    duration,
    ease: 'power2.in',
    onComplete: () => {
      scene.remove(sprite)
      sprite.material.dispose()
    },
  })
}

/** 斬撃・打撃のヒットスパーク一式。 */
export function hitSpark(
  fx: FxManager,
  pos: THREE.Vector3,
  color: THREE.ColorRepresentation = 0xbfd9ff,
  power = 1,
): void {
  const { sparkTex } = textures()
  glowPop(fx.scene, pos, 0xffffff, 2.4 * power, 0.22)
  fx.add(
    new ParticleBurst(fx.scene, {
      texture: sparkTex,
      position: pos,
      count: Math.round(26 * power),
      colorA: 0xffffff,
      colorB: color,
      size: 0.34 * power,
      speed: [4, 10 * power],
      gravity: 9,
      drag: 2.2,
      life: [0.18, 0.5],
    }),
  )
}

/** 走り込み・着地の砂煙。 */
export function dustPuff(fx: FxManager, pos: THREE.Vector3, dir: number, power = 1): void {
  const { glowTex } = textures()
  fx.add(
    new ParticleBurst(fx.scene, {
      texture: glowTex,
      position: new THREE.Vector3(pos.x, 0.25, pos.z),
      count: Math.round(14 * power),
      colorA: 0x4a5578,
      colorB: 0x232c4a,
      size: 0.9,
      speed: [1.5, 4 * power],
      direction: new THREE.Vector3(dir, 0.45, 0),
      spread: 0.55,
      gravity: 1.2,
      drag: 3,
      life: [0.3, 0.8],
    }),
  )
}
