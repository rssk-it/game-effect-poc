import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from './assets'
import { FxMaterial, colorRamp } from './fxmaterial'
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
  /** GLB共有ジオメトリと違い、インスタンス固有に生成したジオメトリは破棄が必要 */
  private ownedGeos: THREE.BufferGeometry[] = []
  /** FxMaterial以外の付随マテリアル（スプライト等）の破棄用 */
  private ownedMats: THREE.Material[] = []
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

  /** このFX専用に生成したジオメトリを登録し、破棄時に dispose する。 */
  protected ownGeometry<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownedGeos.push(geo)
    return geo
  }

  /** FxMaterial以外のマテリアルを登録し、破棄時に dispose する。 */
  protected ownMaterial<T extends THREE.Material>(mat: T): T {
    this.ownedMats.push(mat)
    return mat
  }

  /** グロースプライト（ビルボード）をグループに追加する簡易エミッター。 */
  protected addGlowSprite(color: THREE.ColorRepresentation, scaleX: number, scaleY: number, opacity = 1): THREE.Sprite {
    const sprite = new THREE.Sprite(
      this.ownMaterial(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    )
    sprite.scale.set(scaleX, scaleY, 1)
    sprite.renderOrder = 6
    this.group.add(sprite)
    return sprite
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
      for (const m of this.ownedMats) m.dispose()
      for (const g of this.ownedGeos) g.dispose()
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

    // 1. 本体の帯（発生直後は白熱 → 固有色へ冷める）
    const mat = new FxMaterial({
      map: assets.tex.slashStreak,
      color,
      edgeColor,
      scroll: [0.35, 0],
      distort: 0.025,
      dissolveSoft: 0.18,
      fadeTop: 0.25,
      fadeBottom: 0.25,
      desaturate,
    })
    const mesh = this.addMesh(assets.geo.slashTrail, mat, 7)
    colorRamp(mat, [0xffffff, color], duration * 0.65)

    // 2. 白熱コア（細い帯・本体より速く走査して消える）
    const coreMat = new FxMaterial({
      map: assets.tex.slashStreak,
      color: 0xffffff,
      scroll: [0.6, 0],
      dissolveSoft: 0.12,
      fadeTop: 0.42,
      fadeBottom: 0.42,
      desaturate,
    })
    const core = this.addMesh(assets.geo.slashTrail, coreMat, 8)
    core.scale.setScalar(0.99)
    if (mirror) {
      mesh.scale.x = -1
      core.scale.x = -0.99
    }

    this.group.position.copy(pos)
    this.group.rotation.set(0, yaw, roll * (mirror ? -1 : 1), 'YXZ')
    this.group.scale.setScalar(scale * 0.55)
    this.sweepSpeed = (mirror ? 1 : -1) * 9

    this.start()

    // 3. 発生の先端フラッシュ
    glowPop(fx.scene, pos, 0xffffff, scale * 0.55, 0.15)

    // 4. 剣風の速度線スパーク（スイング方向に流す）
    fx.add(
      new ParticleBurst(fx.scene, {
        texture: sparkTexture(),
        position: pos,
        count: 12,
        colorA: 0xffffff,
        colorB: color,
        size: 0.22,
        speed: [4, 8],
        direction: new THREE.Vector3(mirror ? 1 : -1, 0.15, 0.2),
        spread: 0.35,
        drag: 3,
        life: [0.12, 0.3],
      }),
    )

    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(this.group.scale, { x: scale, y: scale, z: scale, duration: duration * 0.45, ease: 'power4.out' }, 0)
    tl.to(mat, { dissolve: 1, duration, ease: 'power1.in' }, duration * 0.18)
    tl.to(coreMat, { dissolve: 1, duration: duration * 0.7, ease: 'power2.in' }, duration * 0.1)
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
  private heatCore: THREE.Sprite
  private baseGlow: THREE.Sprite

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

    // 1. 外周の火流（energy-stream を第2レイヤに重ねて光の筋を流す + 熱歪み）
    const outerMat = new FxMaterial({
      map: assets.tex.fireNoise,
      color,
      edgeColor,
      scroll: [0.22, -0.85],
      repeat: [1, 1],
      map2: assets.tex.energyStream,
      scroll2: [-0.1, -1.6],
      repeat2: [2, 1],
      layerMix: 0.55,
      distort: 0.05,
      dissolveSoft: 0.2,
      fadeTop: 0.45,
      fadeBottom: 0.12,
      desaturate,
    })
    // 2. 内周の逆回転火流
    const innerMat = new FxMaterial({
      map: assets.tex.fireNoise,
      color: innerColor,
      edgeColor,
      scroll: [-0.3, -1.25],
      repeat: [1.4, 1],
      distort: 0.035,
      dissolveSoft: 0.2,
      fadeTop: 0.4,
      fadeBottom: 0.1,
      desaturate,
    })
    this.outer = this.addMesh(assets.geo.vortex, outerMat, 7)
    this.inner = this.addMesh(assets.geo.vortex, innerMat, 8)
    this.inner.scale.setScalar(0.62)

    // 3. 中心の熱コア（脈動するビルボード）
    this.heatCore = this.addGlowSprite(desaturate > 0 ? innerColor : 0xffdf9e, 1.6, 2.4, 0.85)
    this.heatCore.position.y = 0.9

    // 4. 足元の熱だまり（扁平グロー）
    this.baseGlow = this.addGlowSprite(color, 3.0, 1.0, 0.7)
    this.baseGlow.position.y = 0.15

    this.group.position.copy(pos)
    this.group.scale.set(scale, scale * 0.12, scale)
    this.start()

    // 色キーフレーム: 白熱 → 固有色 → 燃え尽きの暗色
    colorRamp(outerMat, [0xfff1d8, color, 0x8a2408], duration, 0)
    colorRamp(innerMat, [0xffffff, innerColor], duration * 0.6, 0)

    // 立ち上がり → 維持 → ディゾルブ消滅
    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(this.group.scale, { y: scale, duration: 0.5, ease: 'back.out(1.4)' }, 0)
    tl.to([outerMat, innerMat], { dissolve: 0.12, duration: 0.4, ease: 'power1.out' }, 0)
    tl.to([outerMat, innerMat], { dissolve: 1, duration: 0.7, ease: 'power2.in' }, duration - 0.7)
    tl.to([this.heatCore.material, this.baseGlow.material], { opacity: 0, duration: 0.6, ease: 'power2.in' }, duration - 0.6)

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
    // 熱コアの脈動
    const pulse = 1 + 0.14 * Math.sin(this.t * 11) + 0.06 * Math.sin(this.t * 27)
    this.heatCore.scale.set(1.6 * pulse, 2.4 * pulse, 1)
    this.baseGlow.scale.set(3.0 * (2 - pulse), 1.0, 1)
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

/** 外縁が盛り上がったリングメッシュが走る3D衝撃波。二段構成+フラッシュ+土煙。 */
export class Shockwave3D extends MeshFx {
  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: ShockwaveOptions = {}) {
    super(fx)
    const { maxScale = 7.5, duration = 0.7, color = 0xbfe4ff, edgeColor = 0xffffff, crack = false } = o

    this.group.position.set(pos.x, 0.05, pos.z)
    this.start()

    // 1. 主リング
    const mat = new FxMaterial({
      map: assets.tex.shockwaveRing,
      color,
      edgeColor,
      dissolveSoft: 0.22,
      radialFade: 0.72,
    })
    const ring = this.addMesh(assets.geo.shockwave, mat, 6)
    ring.scale.setScalar(0.4)

    // 2. 追い波（白く薄いリングが少し遅れて速く走る）
    const chaserMat = new FxMaterial({
      map: assets.tex.shockwaveRing,
      color: 0xffffff,
      dissolveSoft: 0.3,
      radialFade: 0.72,
      opacity: 0.8,
    })
    const chaser = this.addMesh(assets.geo.shockwave, chaserMat, 6)
    chaser.scale.set(0.2, 0.1, 0.2)

    // 3. 中心の炸裂フラッシュ
    const flash = this.addGlowSprite(0xffffff, 0.8, 0.8, 1)
    flash.position.y = 0.4

    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(ring.scale, { x: maxScale, z: maxScale, y: maxScale * 0.8, duration, ease: 'power3.out' }, 0)
    tl.to(mat, { dissolve: 1, duration: duration * 0.75, ease: 'power1.in' }, duration * 0.25)
    tl.to(chaser.scale, { x: maxScale * 0.72, z: maxScale * 0.72, y: maxScale * 0.25, duration: duration * 0.85, ease: 'power4.out' }, 0.07)
    tl.to(chaserMat, { dissolve: 1, duration: duration * 0.6, ease: 'power1.in' }, 0.25)
    tl.to(flash.scale, { x: maxScale * 0.55, y: maxScale * 0.4, duration: duration * 0.35, ease: 'power3.out' }, 0)
    tl.to(flash.material, { opacity: 0, duration: duration * 0.35, ease: 'power2.in' }, duration * 0.12)

    // 4. 外周へ弾ける土煙
    fx.add(
      new ParticleBurst(fx.scene, {
        texture: glowTexture(),
        position: pos.clone().add(new THREE.Vector3(0, 0.25, 0)),
        count: 20,
        colorA: color,
        colorB: 0x556080,
        size: 0.55,
        speed: [maxScale * 0.9, maxScale * 1.6],
        direction: new THREE.Vector3(0, 0.12, 0),
        spread: 0.95,
        gravity: 2.5,
        drag: 3.2,
        life: [0.25, 0.6],
      }),
    )

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
  private shafts: THREE.Mesh[] = []

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

    // 3. 内側で交差する2枚のライトシャフト（薄い光の板が逆回転）
    const shaftMats: FxMaterial[] = []
    for (let i = 0; i < 2; i++) {
      const shaftMat = new FxMaterial({
        map: assets.tex.energyStream,
        color: innerColor,
        scroll: [0, -1.4 - i * 0.35],
        repeat: [1, 1],
        dissolveSoft: 0.25,
        fadeTop: 0.55,
        fadeBottom: 0.2,
        opacity: 0.75,
      })
      const shaft = this.addMesh(this.ownGeometry(new THREE.PlaneGeometry(1.1, 3.4)), shaftMat, 8)
      shaft.position.y = 1.7
      shaft.rotation.y = (i * Math.PI) / 2
      shaftMats.push(shaftMat)
      this.shafts.push(shaft)
    }

    // 4. 足元の光だまり（groupスケールを継承するのでローカル単位で指定）
    const baseGlow = this.addGlowSprite(color, 2.6, 0.9, 0.8)
    baseGlow.position.y = 0.2

    this.group.position.copy(pos)
    this.group.scale.set(scale * 0.05, scale, scale * 0.05)
    this.start()

    glowPop(fx.scene, pos.clone().add(new THREE.Vector3(0, 0.4, 0)), color, 4 * scale, 0.5)
    colorRamp(outerMat, [0xffffff, color], 0.7)

    const tl = gsap.timeline({ onComplete: () => this.kill() })
    tl.to(this.group.scale, { x: scale, z: scale, duration: 0.35, ease: 'power4.out' }, 0)
    tl.to([outerMat, innerMat, ...shaftMats], { dissolve: 1, duration: 0.8, ease: 'power2.in' }, duration - 0.8)
    tl.to(baseGlow.material, { opacity: 0, duration: 0.7, ease: 'power2.in' }, duration - 0.7)

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
    for (const shaft of this.shafts) shaft.rotation.y += 1.5 * dt
  }
}

// ---------------------------------------------------------------- 昇華リング（バフ）

export interface RisingRingsOptions {
  count?: number
  scale?: number
  color?: THREE.ColorRepresentation
  /** リング1枚が昇りきるまでの秒数 */
  riseTime?: number
  height?: number
}

/** 衝撃波リングメッシュが体に沿って昇っていくバフ・オーラ演出。 */
export class RisingRings extends MeshFx {
  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: RisingRingsOptions = {}) {
    super(fx)
    const { count = 3, scale = 1.7, color = 0xffb54d, riseTime = 0.9, height = 2.8 } = o

    this.group.position.copy(pos)
    this.start()

    for (let i = 0; i < count; i++) {
      const mat = new FxMaterial({
        map: assets.tex.shockwaveRing,
        color,
        edgeColor: 0xffffff,
        dissolveSoft: 0.3,
        radialFade: 0.75,
        opacity: 0,
      })
      const mesh = this.addMesh(assets.geo.shockwave, mat, 7)
      mesh.position.y = 0.1
      mesh.scale.setScalar(scale * 1.25)

      // 時間差で: 出現 → 昇りながら収束 → ディゾルブ
      gsap.delayedCall(i * 0.24, () => {
        mat.opacity2 = 1
        gsap.to(mesh.position, { y: height, duration: riseTime, ease: 'power1.out' })
        gsap.to(mesh.scale, {
          x: scale * 0.5,
          y: scale * 0.5,
          z: scale * 0.5,
          duration: riseTime,
          ease: 'power1.out',
        })
        gsap.to(mat, { dissolve: 1, duration: riseTime * 0.6, ease: 'power1.in', delay: riseTime * 0.4 })
      })
    }
    gsap.delayedCall(count * 0.24 + riseTime + 0.1, () => this.kill())
  }

  protected onUpdate(dt: number): void {
    for (const mesh of this.meshes) mesh.rotation.y += 1.6 * dt
  }
}

// ---------------------------------------------------------------- 氷結晶（フロスト）

export interface FrostSpikesOptions {
  count?: number
  radius?: number
  color?: THREE.ColorRepresentation
  innerColor?: THREE.ColorRepresentation
  duration?: number
  maxHeight?: number
}

/** 地面から六角錐の氷晶がせり上がり、砕けるように消えるフロスト演出。 */
export class FrostSpikes extends MeshFx {
  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: FrostSpikesOptions = {}) {
    super(fx)
    const { count = 7, radius = 1.0, color = 0x8fd4ff, innerColor = 0xe8f8ff, duration = 1.5, maxHeight = 1.9 } = o

    this.group.position.copy(pos)
    this.start()

    for (let i = 0; i < count; i++) {
      const h = maxHeight * (0.45 + Math.random() * 0.55)
      const r = h * (0.16 + Math.random() * 0.06)
      const geo = this.ownGeometry(new THREE.ConeGeometry(r, h, 6, 1))
      geo.translate(0, h / 2, 0) // 根本を原点に

      const mat = new FxMaterial({
        map: assets.tex.energyStream,
        color: Math.random() < 0.4 ? innerColor : color,
        edgeColor: 0xffffff,
        desaturate: 1,
        scroll: [0, -0.25],
        dissolveSoft: 0.22,
        fadeBottom: 0.12,
      })
      const mesh = this.addMesh(geo, mat, 7)

      // 中心から外へ傾けつつ環状に配置
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5
      const dist = radius * (0.25 + Math.random() * 0.75)
      mesh.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist)
      mesh.rotation.set(
        Math.sin(ang) * 0.3 * (dist / radius),
        Math.random() * Math.PI,
        -Math.cos(ang) * 0.3 * (dist / radius),
      )
      mesh.scale.set(1, 0.02, 1)

      gsap.delayedCall(i * 0.055, () => {
        gsap.to(mesh.scale, { y: 1, duration: 0.28, ease: 'back.out(2.2)' })
      })
      gsap.delayedCall(duration - 0.45, () => {
        gsap.to(mat, { dissolve: 1, duration: 0.45, ease: 'power2.in' })
      })
    }

    // 冷気のミスト
    fx.add(
      new ParticleBurst(fx.scene, {
        texture: glowTexture(),
        position: pos.clone().add(new THREE.Vector3(0, 0.3, 0)),
        count: 18,
        colorA: 0xbfe8ff,
        colorB: 0x6ab8e8,
        size: 0.8,
        speed: [0.6, 1.6],
        direction: new THREE.Vector3(0, 0.4, 0),
        spread: 0.8,
        gravity: -0.3,
        drag: 1.6,
        life: [0.8, 1.5],
      }),
    )
    // 凍った地面（マグマ地割れテクスチャの輝度化・氷色転用）
    new GroundCrack(fx, assets, pos, { scale: radius * 3.6, duration: duration + 0.3, color: 0x8fd4ff, desaturate: 1 })
    // 結晶表面のきらめき（ランダムな時間差で小さな光が瞬く）
    for (let i = 0; i < 4; i++) {
      gsap.delayedCall(0.35 + Math.random() * (duration - 0.9), () => {
        const at = pos
          .clone()
          .add(
            new THREE.Vector3(
              (Math.random() - 0.5) * radius * 1.6,
              0.5 + Math.random() * (maxHeight * 0.7),
              (Math.random() - 0.5) * radius * 1.6,
            ),
          )
        glowPop(fx.scene, at, 0xffffff, 0.7, 0.22)
      })
    }
    // 砕け散る氷片
    gsap.delayedCall(duration - 0.4, () => {
      fx.add(
        new ParticleBurst(fx.scene, {
          texture: sparkTexture(),
          position: pos.clone().add(new THREE.Vector3(0, 0.8, 0)),
          count: 30,
          colorA: 0xffffff,
          colorB: 0x9fdcff,
          size: 0.22,
          speed: [2, 5],
          gravity: 6,
          drag: 1.2,
          life: [0.3, 0.7],
        }),
      )
    })

    gsap.delayedCall(duration + 0.1, () => this.kill())
  }

  protected onUpdate(): void {}
}

// ---------------------------------------------------------------- 落雷

export interface LightningStrikeOptions {
  color?: THREE.ColorRepresentation
  /** 稲妻の本数（時間差で走る） */
  strikes?: number
  height?: number
}

/**
 * 手続き生成の落雷。中点変位でジグザグ経路を作り、チューブ2重（白コア+色グロー）で描画。
 * 時間差で複数本走り、高周波の明滅を伴って消える。
 */
export class LightningStrike implements Updatable {
  private scene: THREE.Scene
  private group = new THREE.Group()
  private disposables: Array<THREE.BufferGeometry | THREE.Material> = []
  private t = 0
  private dead = false

  constructor(fx: FxManager, pos: THREE.Vector3, o: LightningStrikeOptions = {}) {
    const { color = 0x9fc8ff, strikes = 3, height = 8 } = o
    this.scene = fx.scene
    this.scene.add(this.group)
    fx.add(this)

    for (let s = 0; s < strikes; s++) {
      gsap.delayedCall(s * 0.13, () => {
        if (this.dead) return
        this.spawnBolt(fx, pos, height, color, s === strikes - 1)
      })
    }
    gsap.delayedCall(strikes * 0.13 + 0.55, () => {
      this.dead = true
    })
  }

  private spawnBolt(
    fx: FxManager,
    pos: THREE.Vector3,
    height: number,
    color: THREE.ColorRepresentation,
    last: boolean,
  ): void {
    const top = new THREE.Vector3(
      pos.x + (Math.random() - 0.5) * 3,
      pos.y + height,
      pos.z + (Math.random() - 0.5) * 3,
    )
    const points: THREE.Vector3[] = []
    const segs = 9
    for (let i = 0; i <= segs; i++) {
      const v = i / segs
      const p = top.clone().lerp(pos, v)
      if (i > 0 && i < segs) {
        const wobble = 0.55 * Math.sin(Math.PI * v) + 0.15
        p.x += (Math.random() - 0.5) * 2 * wobble
        p.z += (Math.random() - 0.5) * 2 * wobble
      }
      points.push(p)
    }
    const curve = new THREE.CatmullRomCurve3(points)

    const coreGeo = new THREE.TubeGeometry(curve, 48, 0.035, 5)
    const glowGeo = new THREE.TubeGeometry(curve, 48, 0.14, 5)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    const glow = new THREE.Mesh(glowGeo, glowMat)
    core.renderOrder = 8
    glow.renderOrder = 8
    this.group.add(core, glow)
    this.disposables.push(coreGeo, glowGeo, coreMat, glowMat)

    // 分岐（本流の中腹から短い枝が1〜2本逸れる）
    const branchCount = 1 + Math.floor(Math.random() * 2)
    for (let b = 0; b < branchCount; b++) {
      const from = points[2 + Math.floor(Math.random() * 4)].clone()
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, -0.6 - Math.random(), (Math.random() - 0.5) * 2)
        .normalize()
        .multiplyScalar(1.2 + Math.random() * 1.4)
      const bp: THREE.Vector3[] = [from]
      for (let i = 1; i <= 3; i++) {
        bp.push(
          from
            .clone()
            .addScaledVector(dir, i / 3)
            .add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5)),
        )
      }
      const bGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 16, 0.02, 4)
      const bMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const branch = new THREE.Mesh(bGeo, bMat)
      branch.renderOrder = 8
      this.group.add(branch)
      this.disposables.push(bGeo, bMat)
      gsap.to(bMat, { opacity: 0, duration: 0.25, ease: 'power2.in', delay: 0.05 })
    }

    glowPop(this.scene, top, color, 2.5, 0.25)
    glowPop(this.scene, pos.clone().setY(pos.y + 0.3), 0xffffff, last ? 4 : 2.5, 0.3)
    // 上空の面フラッシュ（雲が光る感じの大きく淡いグロー）
    glowPop(this.scene, top.clone().add(new THREE.Vector3(0, 1.5, 0)), 0x6f8fd8, 9, 0.3)
    gsap.to([coreMat, glowMat], { opacity: 0, duration: 0.38, ease: 'power2.in', delay: 0.08 })

    if (last) {
      fx.add(
        new ParticleBurst(this.scene, {
          texture: sparkTexture(),
          position: pos.clone().add(new THREE.Vector3(0, 0.4, 0)),
          count: 34,
          colorA: 0xffffff,
          colorB: color,
          size: 0.3,
          speed: [3, 9],
          gravity: 8,
          drag: 2,
          life: [0.2, 0.55],
        }),
      )
      // 帯電の名残（ゆっくり立ちのぼるイオン粒子）
      fx.add(
        new ParticleBurst(this.scene, {
          texture: glowTexture(),
          position: pos.clone().add(new THREE.Vector3(0, 0.6, 0)),
          count: 14,
          colorA: 0xbfd8ff,
          colorB: color,
          size: 0.24,
          speed: [0.5, 1.4],
          direction: new THREE.Vector3(0, 1, 0),
          spread: 0.5,
          gravity: -1.2,
          drag: 1,
          life: [0.6, 1.2],
        }),
      )
    }
  }

  update(dt: number): boolean {
    if (this.dead) {
      this.scene.remove(this.group)
      for (const d of this.disposables) d.dispose()
      return false
    }
    this.t += dt
    // 高周波の明滅（数フレームごとに一瞬消える）
    this.group.visible = Math.sin(this.t * 70) > -0.85
    return true
  }
}
