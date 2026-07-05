import * as THREE from 'three'
import gsap from 'gsap'
import { glowTexture } from './textures'
import { FxManager, ParticleBurst, type Updatable } from './particles'
import { FxMaterial } from './fxmaterial'
import { glowPop } from './impact'
import { isWireframeOn } from './wire-state'

/**
 * 足元の魔法陣。appear → (回転し続ける) → dismiss。
 * color を指定するとテクスチャを輝度化してtintする（金の審判陣・緑の回復陣など）。
 */
export class MagicCircle implements Updatable {
  private mesh: THREE.Mesh
  private material: FxMaterial
  private scene: THREE.Scene
  private dead = false

  constructor(
    fx: FxManager,
    texture: THREE.Texture,
    pos: THREE.Vector3,
    private maxScale = 5,
    color?: THREE.ColorRepresentation,
  ) {
    this.scene = fx.scene
    this.material = new FxMaterial({
      map: texture,
      color: color ?? 0xffffff,
      desaturate: color !== undefined ? 1 : 0,
      opacity: 0,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.set(pos.x, 0.08, pos.z)
    this.mesh.scale.setScalar(0.1)
    this.mesh.renderOrder = 3
    // ワイヤーフレーム確認中は発光オーバーレイを描かない（ビューアのトグルにも追従させる）
    this.mesh.userData.fxOverlay = true
    this.material.visible = !isWireframeOn()
    this.scene.add(this.mesh)
    fx.add(this)
  }

  appear(duration = 0.8): void {
    gsap.to(this.mesh.scale, { x: this.maxScale, y: this.maxScale, duration, ease: 'back.out(1.6)' })
    gsap.to(this.material, { opacity2: 1, duration: duration * 0.6, ease: 'power2.out' })
  }

  dismiss(duration = 0.5): void {
    gsap.to(this.mesh.scale, { x: this.maxScale * 1.5, y: this.maxScale * 1.5, duration, ease: 'power2.in' })
    gsap.to(this.material, {
      opacity2: 0,
      duration,
      ease: 'power2.in',
      onComplete: () => {
        this.dead = true
      },
    })
  }

  update(dt: number): boolean {
    if (this.dead) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.material.dispose()
      return false
    }
    this.mesh.rotation.z += dt * 0.9
    return true
  }
}

/** 詠唱チャージ: 収束パーティクル + 手元の光球。 */
export function chargeParticles(fx: FxManager, pos: THREE.Vector3, color: THREE.ColorRepresentation = 0xc27bff): void {
  fx.add(
    new ParticleBurst(fx.scene, {
      texture: glowTexture(),
      position: pos,
      count: 46,
      colorA: 0xffffff,
      colorB: color,
      size: 0.26,
      speed: [2.2, 3.6],
      life: [0.6, 1.15],
      converge: true,
      radius: 3.4,
    }),
  )
}

/**
 * 極太ビーム。from→to を貫く加算シリンダー2重構造 + 両端の光球。
 * fire() で発射しタイムラインを返す（完了時に自壊）。
 */
export function fireBeam(
  scene: THREE.Scene,
  from: THREE.Vector3,
  to: THREE.Vector3,
  opts: { coreColor?: THREE.ColorRepresentation; outerColor?: THREE.ColorRepresentation; radius?: number; duration?: number } = {},
): gsap.core.Timeline {
  const { coreColor = 0xffffff, outerColor = 0xa64dff, radius = 0.55, duration = 1.5 } = opts

  const dir = to.clone().sub(from)
  const length = dir.length()
  const mid = from.clone().add(to).multiplyScalar(0.5)

  const group = new THREE.Group()
  group.position.copy(mid)
  // シリンダー(Y軸) を from→to 方向へ向ける
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())

  const coreMat = new THREE.MeshBasicMaterial({
    color: coreColor,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const outerMat = new THREE.MeshBasicMaterial({
    color: outerColor,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, length, 20, 1, true), coreMat)
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20, 1, true), outerMat)
  // ワイヤーフレーム確認中は発光ビームを描かない（ビューアのトグルにも追従させる）
  core.userData.fxOverlay = true
  outer.userData.fxOverlay = true
  coreMat.visible = outerMat.visible = !isWireframeOn()
  core.renderOrder = 8
  outer.renderOrder = 8
  group.add(core, outer)

  group.scale.set(0.01, 1, 0.01)
  scene.add(group)

  glowPop(scene, from, outerColor, 4, 0.5)
  glowPop(scene, to, 0xffffff, 5, 0.6)

  const tl = gsap.timeline({
    onComplete: () => {
      scene.remove(group)
      core.geometry.dispose()
      outer.geometry.dispose()
      coreMat.dispose()
      outerMat.dispose()
    },
  })
  // 一気に開く → うねりながら維持 → 収束
  tl.to(group.scale, { x: 1, z: 1, duration: 0.12, ease: 'power4.out' })
  tl.to(group.scale, {
    x: 1.25,
    z: 1.25,
    duration: 0.09,
    ease: 'sine.inOut',
    yoyo: true,
    repeat: Math.max(1, Math.floor((duration - 0.5) / 0.09)),
  })
  tl.to(group.scale, { x: 0.01, z: 0.01, duration: 0.3, ease: 'power2.in' })
  tl.to([coreMat, outerMat], { opacity: 0, duration: 0.3, ease: 'power1.in' }, '<')
  return tl
}
