import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from './assets'
import { FxMaterial } from './fxmaterial'
import { FxManager, ParticleBurst, type Updatable } from './particles'
import { glowPop } from './impact'
import { glowTexture, sparkTexture } from './textures'

/**
 * Blender製メッシュ + image-gen製テクスチャによるリッチエフェクト群。
 * すべて生成後は自己管理（gsapエンベロープ + FxManager更新）で自壊する。
 */

/** ワイヤーフレーム表示（ビューアのデバッグ用）。生存中のFXにも即時反映される。 */
let wireframeEnabled = false
const activeFx = new Set<MeshFx>()

export function setFxWireframe(enabled: boolean): void {
  wireframeEnabled = enabled
  for (const fx of activeFx) fx.setWireframe(enabled)
}

export function getFxWireframe(): boolean {
  return wireframeEnabled
}

/** メッシュFXの共通土台: uTime の前進と破棄処理をまとめる。 */
abstract class MeshFx implements Updatable {
  readonly group = new THREE.Group()
  protected mats: FxMaterial[] = []
  protected meshes: THREE.Mesh[] = []
  private wires: THREE.Mesh[] = []
  private wireMat: THREE.MeshBasicMaterial | null = null
  protected t = 0
  protected dead = false

  constructor(protected fx: FxManager) {}

  protected addMesh(geo: THREE.BufferGeometry, mat: FxMaterial, renderOrder = 7): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = renderOrder
    this.group.add(mesh)
    this.mats.push(mat)
    this.meshes.push(mesh)
    return mesh
  }

  /** 各FXメッシュの子としてワイヤー用メッシュを付け外しする（トランスフォームを継承）。 */
  setWireframe(enabled: boolean): void {
    if (enabled && this.wires.length === 0) {
      this.wireMat ??= new THREE.MeshBasicMaterial({
        wireframe: true,
        color: 0x6cff9e,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      })
      for (const mesh of this.meshes) {
        const wire = new THREE.Mesh(mesh.geometry, this.wireMat)
        wire.renderOrder = 9
        mesh.add(wire)
        this.wires.push(wire)
      }
    } else if (!enabled && this.wires.length > 0) {
      for (const wire of this.wires) wire.removeFromParent()
      this.wires = []
    }
  }

  protected start(): void {
    this.fx.scene.add(this.group)
    this.fx.add(this)
    activeFx.add(this)
    if (wireframeEnabled) this.setWireframe(true)
  }

  kill(): void {
    this.dead = true
  }

  protected abstract onUpdate(dt: number): void

  update(dt: number): boolean {
    if (this.dead) {
      this.fx.scene.remove(this.group)
      for (const m of this.mats) m.dispose()
      this.wireMat?.dispose()
      activeFx.delete(this)
      return false
    }
    this.t += dt
    for (const m of this.mats) m.time = this.t
    this.onUpdate(dt)
    return true
  }
}

// ---------------------------------------------------------------- 斬撃トレイル

export interface SlashTrailOptions {
  scale?: number
  /** 水平回転（向き） */
  yaw?: number
  /** 斬撃面の傾き */
  roll?: number
  /** 逆袈裟にする */
  mirror?: boolean
  color?: THREE.ColorRepresentation
  edgeColor?: THREE.ColorRepresentation
  duration?: number
  /** 1でテクスチャ輝度×tint（青ストリークを赤斬撃等に色替えする時に使う） */
  desaturate?: number
}

/** 円錐帯メッシュを回転スイープさせる3D斬撃トレイル。 */
export class SlashTrail extends MeshFx {
  private sweepSpeed: number

  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: SlashTrailOptions = {}) {
    super(fx)
    const { scale = 3.6, yaw = 0, roll = 0.55, mirror = false, color = 0x9ed4ff, edgeColor = 0xffffff, duration = 0.42, desaturate = 0 } = o

    const mat = new FxMaterial({
      map: assets.tex.slashStreak,
      color,
      edgeColor,
      scroll: [0.35, 0],
      dissolveSoft: 0.18,
      fadeTop: 0.25,
      fadeBottom: 0.25,
      desaturate,
    })
    const mesh = this.addMesh(assets.geo.slashTrail, mat, 7)
    if (mirror) mesh.scale.x = -1

    this.group.position.copy(pos)
    this.group.rotation.set(0, yaw, roll * (mirror ? -1 : 1), 'YXZ')
    this.group.scale.setScalar(scale * 0.55)
    this.sweepSpeed = (mirror ? 1 : -1) * 9

    this.start()

    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(this.group.scale, { x: scale, y: scale, z: scale, duration: duration * 0.45, ease: 'power4.out' }, 0)
    tl.to(mat, { dissolve: 1, duration, ease: 'power1.in' }, duration * 0.18)
  }

  protected onUpdate(dt: number): void {
    this.group.rotation.y += this.sweepSpeed * dt
    this.sweepSpeed *= Math.max(0, 1 - 6 * dt)
  }
}

// ---------------------------------------------------------------- 炎の竜巻

export interface FireVortexOptions {
  scale?: number
  duration?: number
  color?: THREE.ColorRepresentation
  innerColor?: THREE.ColorRepresentation
  edgeColor?: THREE.ColorRepresentation
  /** 火の粉パーティクルを出すか */
  embers?: boolean
  /** 1でテクスチャ輝度×tint（紫の渦など色替えバリアント用） */
  desaturate?: number
}

/** 二重の逆回転スパイラルメッシュによる火柱竜巻。 */
export class FireVortex extends MeshFx {
  private inner: THREE.Mesh
  private outer: THREE.Mesh

  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: FireVortexOptions = {}) {
    super(fx)
    const {
      scale = 1.6,
      duration = 2.4,
      color = 0xff7a2a,
      innerColor = 0xffc36a,
      edgeColor = 0xffe9b0,
      embers = true,
      desaturate = 0,
    } = o

    const outerMat = new FxMaterial({
      map: assets.tex.fireNoise,
      color,
      edgeColor,
      scroll: [0.22, -0.85],
      repeat: [1, 1],
      dissolveSoft: 0.2,
      fadeTop: 0.45,
      fadeBottom: 0.12,
      desaturate,
    })
    const innerMat = new FxMaterial({
      map: assets.tex.fireNoise,
      color: innerColor,
      edgeColor,
      scroll: [-0.3, -1.25],
      repeat: [1.4, 1],
      dissolveSoft: 0.2,
      fadeTop: 0.4,
      fadeBottom: 0.1,
      desaturate,
    })
    this.outer = this.addMesh(assets.geo.vortex, outerMat, 7)
    this.inner = this.addMesh(assets.geo.vortex, innerMat, 8)
    this.inner.scale.setScalar(0.62)

    this.group.position.copy(pos)
    this.group.scale.set(scale, scale * 0.12, scale)
    this.start()

    // 立ち上がり → 維持 → ディゾルブ消滅
    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(this.group.scale, { y: scale, duration: 0.5, ease: 'back.out(1.4)' }, 0)
    tl.to([outerMat, innerMat], { dissolve: 0.12, duration: 0.4, ease: 'power1.out' }, 0)
    tl.to([outerMat, innerMat], { dissolve: 1, duration: 0.7, ease: 'power2.in' }, duration - 0.7)

    if (embers) {
      const emit = () =>
        fx.add(
          new ParticleBurst(fx.scene, {
            texture: sparkTexture(),
            position: pos.clone().add(new THREE.Vector3(0, 0.4, 0)),
            count: 18,
            colorA: 0xffd27a,
            colorB: 0xff6a2a,
            size: 0.22,
            speed: [1.5, 4],
            direction: new THREE.Vector3(0, 1, 0),
            spread: 0.5,
            gravity: -2.2,
            drag: 0.8,
            life: [0.5, 1.1],
          }),
        )
      emit()
      gsap.delayedCall(duration * 0.35, emit)
      gsap.delayedCall(duration * 0.65, emit)
    }
  }

  protected onUpdate(dt: number): void {
    this.outer.rotation.y += 3.2 * dt
    this.inner.rotation.y -= 4.8 * dt
  }
}

// ---------------------------------------------------------------- 3D衝撃波

export interface ShockwaveOptions {
  maxScale?: number
  duration?: number
  color?: THREE.ColorRepresentation
  edgeColor?: THREE.ColorRepresentation
  /** 地割れデカールも同時に出す */
  crack?: boolean
}

/** 外縁が盛り上がったリングメッシュが走る3D衝撃波。 */
export class Shockwave3D extends MeshFx {
  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: ShockwaveOptions = {}) {
    super(fx)
    const { maxScale = 7.5, duration = 0.7, color = 0xbfe4ff, edgeColor = 0xffffff, crack = false } = o

    const mat = new FxMaterial({
      map: assets.tex.shockwaveRing,
      color,
      edgeColor,
      dissolveSoft: 0.22,
      radialFade: 0.72,
    })
    this.addMesh(assets.geo.shockwave, mat, 6)
    this.group.position.set(pos.x, 0.05, pos.z)
    this.group.scale.setScalar(0.4)
    this.start()

    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(this.group.scale, { x: maxScale, z: maxScale, y: maxScale * 0.8, duration, ease: 'power3.out' }, 0)
    tl.to(mat, { dissolve: 1, duration: duration * 0.75, ease: 'power1.in' }, duration * 0.25)

    if (crack) new GroundCrack(fx, assets, pos, { scale: maxScale * 0.75 })
  }

  protected onUpdate(): void {}
}

// ---------------------------------------------------------------- 地割れデカール

export interface GroundCrackOptions {
  scale?: number
  duration?: number
  color?: THREE.ColorRepresentation
  /** 1でテクスチャ輝度×tint（色替えバリアント用） */
  desaturate?: number
}

/** マグマ地割れの発光デカール。出現 → 脈動 → ディゾルブ。 */
export class GroundCrack extends MeshFx {
  private mat: FxMaterial
  private env = { v: 0 }

  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: GroundCrackOptions = {}) {
    super(fx)
    const { scale = 5, duration = 1.6, color = 0xffb45e, desaturate = 0 } = o

    this.mat = new FxMaterial({
      map: assets.tex.groundCrack,
      color,
      desaturate,
      edgeColor: desaturate > 0 ? color : 0xff5a1a,
      opacity: 0,
      dissolveSoft: 0.16,
      radialFade: 0.55,
    })
    const mesh = this.addMesh(new THREE.PlaneGeometry(1, 1), this.mat, 4)
    mesh.rotation.x = -Math.PI / 2

    this.group.position.set(pos.x, 0.07, pos.z)
    this.group.scale.setScalar(scale * 0.8)
    this.start()

    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(this.env, { v: 1, duration: 0.12, ease: 'power1.out' }, 0)
    tl.to(this.group.scale, { x: scale, y: scale, z: scale, duration: 0.25, ease: 'power3.out' }, 0)
    tl.to(this.mat, { dissolve: 1, duration: duration * 0.5, ease: 'power2.in' }, duration * 0.5)
  }

  protected onUpdate(): void {
    // マグマの脈動（エンベロープ × 揺らぎ）
    this.mat.opacity2 = this.env.v * (0.88 + 0.12 * Math.sin(this.t * 14))
  }
}

// ---------------------------------------------------------------- 光の粒

export interface LightMotesOptions {
  count?: number
  /** 発生範囲（足元の円盤半径） */
  radius?: number
  colorA?: THREE.ColorRepresentation
  colorB?: THREE.ColorRepresentation
  size?: number
  /** 個々の粒の寿命範囲(秒) */
  life?: [number, number]
  /** 発生のばらけ幅(秒)。大きいほど順々にふわっと湧く */
  stagger?: number
  /** 上昇速度範囲 */
  riseSpeed?: [number, number]
}

/**
 * 光の粒がふわっと立ちのぼる控えめなパーティクル。
 * 足元の円盤からスタッガー付きで湧き、ゆらぎながら上昇して溶けるように消える。
 * 勝利・回復・バフなどの穏やかな演出向け。
 */
export class LightMotes implements Updatable {
  private points: THREE.Points
  private material: THREE.PointsMaterial
  private scene: THREE.Scene
  private t = 0

  private origins: Float32Array
  private rises: Float32Array
  private phases: Float32Array
  private amps: Float32Array
  private delays: Float32Array
  private lives: Float32Array
  private baseColors: Float32Array

  constructor(fx: FxManager, pos: THREE.Vector3, o: LightMotesOptions = {}) {
    const count = o.count ?? 26
    const radius = o.radius ?? 1.1
    const [lifeMin, lifeMax] = o.life ?? [1.5, 2.4]
    const stagger = o.stagger ?? 1.0
    const [riseMin, riseMax] = o.riseSpeed ?? [0.55, 1.05]
    const ca = new THREE.Color(o.colorA ?? 0xfff7d9)
    const cb = new THREE.Color(o.colorB ?? 0xffd27a)

    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    this.origins = new Float32Array(count * 3)
    this.rises = new Float32Array(count)
    this.phases = new Float32Array(count)
    this.amps = new Float32Array(count)
    this.delays = new Float32Array(count)
    this.lives = new Float32Array(count)
    this.baseColors = new Float32Array(count * 3)

    const tmp = new THREE.Color()
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * radius
      this.origins[i * 3 + 0] = pos.x + Math.cos(ang) * r
      this.origins[i * 3 + 1] = pos.y + 0.15 + Math.random() * 0.5
      this.origins[i * 3 + 2] = pos.z + Math.sin(ang) * r
      this.rises[i] = riseMin + Math.random() * (riseMax - riseMin)
      this.phases[i] = Math.random() * Math.PI * 2
      this.amps[i] = 0.06 + Math.random() * 0.14
      this.delays[i] = Math.random() * stagger
      this.lives[i] = lifeMin + Math.random() * (lifeMax - lifeMin)

      // 出現前は画面外に置いておく
      positions[i * 3 + 0] = this.origins[i * 3 + 0]
      positions[i * 3 + 1] = -9999
      positions[i * 3 + 2] = this.origins[i * 3 + 2]

      tmp.lerpColors(ca, cb, Math.random())
      this.baseColors[i * 3 + 0] = tmp.r
      this.baseColors[i * 3 + 1] = tmp.g
      this.baseColors[i * 3 + 2] = tmp.b
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    this.material = new THREE.PointsMaterial({
      map: glowTexture(),
      size: o.size ?? 0.42,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
    this.points = new THREE.Points(geo, this.material)
    this.points.renderOrder = 6
    this.scene = fx.scene
    this.scene.add(this.points)
    fx.add(this)
  }

  update(dt: number): boolean {
    this.t += dt
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const col = this.points.geometry.getAttribute('color') as THREE.BufferAttribute
    const parr = pos.array as Float32Array
    const carr = col.array as Float32Array

    let alive = false
    for (let i = 0; i < this.lives.length; i++) {
      const local = this.t - this.delays[i]
      if (local < 0) {
        alive = true
        continue
      }
      const life = this.lives[i]
      if (local >= life) {
        parr[i * 3 + 1] = -9999
        carr[i * 3 + 0] = carr[i * 3 + 1] = carr[i * 3 + 2] = 0
        continue
      }
      alive = true
      const p = local / life
      // ふわっと現れてすっと溶ける明滅エンベロープ + 微細なきらめき
      const env = Math.sin(Math.PI * Math.min(p * 1.6, 1)) * (1 - p * 0.35)
      const twinkle = 0.82 + 0.18 * Math.sin(local * 9 + this.phases[i])
      const sway = Math.sin(local * 2.2 + this.phases[i]) * this.amps[i] * p

      parr[i * 3 + 0] = this.origins[i * 3 + 0] + sway
      parr[i * 3 + 1] = this.origins[i * 3 + 1] + this.rises[i] * local
      parr[i * 3 + 2] = this.origins[i * 3 + 2] + Math.cos(local * 1.8 + this.phases[i]) * this.amps[i] * p
      carr[i * 3 + 0] = this.baseColors[i * 3 + 0] * env * twinkle
      carr[i * 3 + 1] = this.baseColors[i * 3 + 1] * env * twinkle
      carr[i * 3 + 2] = this.baseColors[i * 3 + 2] * env * twinkle
    }
    pos.needsUpdate = true
    col.needsUpdate = true

    if (!alive) {
      this.scene.remove(this.points)
      this.points.geometry.dispose()
      this.material.dispose()
      return false
    }
    return true
  }
}

// ---------------------------------------------------------------- 光の柱

export interface HolyPillarOptions {
  scale?: number
  duration?: number
  color?: THREE.ColorRepresentation
  innerColor?: THREE.ColorRepresentation
  /** 収束パーティクルを出すか */
  gather?: boolean
}

/** ラッパ状メッシュ二重構造の召喚光柱。エネルギーが上へ流れる。 */
export class HolyPillar extends MeshFx {
  private inner: THREE.Mesh
  private outer: THREE.Mesh

  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: HolyPillarOptions = {}) {
    super(fx)
    const { scale = 1.5, duration = 2.2, color = 0xffd98a, innerColor = 0xfff4d6, gather = true } = o

    const outerMat = new FxMaterial({
      map: assets.tex.energyStream,
      color,
      edgeColor: 0xffe9b0,
      scroll: [0.06, -0.75],
      repeat: [1, 1],
      dissolveSoft: 0.2,
      fadeTop: 0.5,
      fadeBottom: 0.08,
    })
    const innerMat = new FxMaterial({
      map: assets.tex.energyStream,
      color: innerColor,
      edgeColor: 0xffffff,
      scroll: [-0.04, -1.1],
      repeat: [1.5, 1],
      dissolveSoft: 0.2,
      fadeTop: 0.45,
      fadeBottom: 0.06,
    })
    this.outer = this.addMesh(assets.geo.pillar, outerMat, 7)
    this.inner = this.addMesh(assets.geo.pillar, innerMat, 8)
    this.inner.scale.set(0.5, 1, 0.5)

    this.group.position.copy(pos)
    this.group.scale.set(scale * 0.05, scale, scale * 0.05)
    this.start()

    glowPop(fx.scene, pos.clone().add(new THREE.Vector3(0, 0.4, 0)), color, 4 * scale, 0.5)

    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(this.group.scale, { x: scale, z: scale, duration: 0.35, ease: 'power4.out' }, 0)
    tl.to([outerMat, innerMat], { dissolve: 1, duration: 0.8, ease: 'power2.in' }, duration - 0.8)

    if (gather) {
      fx.add(
        new ParticleBurst(fx.scene, {
          texture: glowTexture(),
          position: pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
          count: 40,
          colorA: 0xffffff,
          colorB: color,
          size: 0.24,
          speed: [1.8, 3],
          life: [0.5, 1],
          converge: true,
          radius: 3,
        }),
      )
    }
  }

  protected onUpdate(dt: number): void {
    this.outer.rotation.y += 0.7 * dt
    this.inner.rotation.y -= 1.1 * dt
  }
}
