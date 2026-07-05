import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxMaterial, colorRamp } from '../fxmaterial'
import type { FxManager } from '../particles'
import { MeshFx } from '../meshfx'
import { ParticleField } from '../field'
import { sparkTexture } from '../textures'

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

/** 火の粉1粒の螺旋軌道パラメータ。 */
interface SwirlState {
  theta: number
  omega: number
  rise: number
  birth: number
  life: number
  color: THREE.Color
}

/** 二重の逆回転スパイラルメッシュによる火柱竜巻。渦に沿って火の粉が巻き上がる。 */
export class FireVortex extends MeshFx {
  private inner: THREE.Mesh
  private outer: THREE.Mesh
  private heatCore: THREE.Sprite
  private baseGlow: THREE.Sprite
  private swirl: ParticleField | null = null
  private swirlStates: SwirlState[] = []
  private duration: number

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
    this.duration = duration

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

    // 5. 渦に沿って巻き上がる火の粉（円錐面上を螺旋軌道で上昇し、燃え尽きたら再湧きする）
    if (embers) {
      const ca = new THREE.Color(desaturate > 0 ? innerColor : 0xffd27a)
      const cb = new THREE.Color(desaturate > 0 ? color : 0xff6a2a)
      this.swirl = this.own(
        new ParticleField({
          count: 44,
          texture: sparkTexture(),
          size: 0.2,
          renderOrder: 9,
          parent: this.group,
        }),
      )
      this.refreshWireframe()
      for (let i = 0; i < this.swirl.count; i++) {
        this.swirlStates.push({
          ...this.rollSwirl(Math.random() * 1.2), // 発生を1.2秒ばらけさせる
          color: new THREE.Color().lerpColors(ca, cb, Math.random()),
        })
      }
    }
  }

  /** 火の粉1粒分の軌道パラメータを振り直す。 */
  private rollSwirl(delay: number): Omit<SwirlState, 'color'> {
    return {
      theta: Math.random() * Math.PI * 2,
      omega: 3.5 + Math.random() * 3.5,
      rise: 0.9 + Math.random() * 0.9,
      birth: this.t + delay,
      life: 0.8 + Math.random() * 0.7,
    }
  }

  protected onUpdate(dt: number): void {
    this.outer.rotation.y += 3.2 * dt
    this.inner.rotation.y -= 4.8 * dt
    // 熱コアの脈動
    const pulse = 1 + 0.14 * Math.sin(this.t * 11) + 0.06 * Math.sin(this.t * 27)
    this.heatCore.scale.set(1.6 * pulse, 2.4 * pulse, 1)
    this.baseGlow.scale.set(3.0 * (2 - pulse), 1.0, 1)

    // 火の粉の螺旋軌道更新
    if (this.swirl) {
      const spawning = this.t < this.duration - 0.8
      for (let i = 0; i < this.swirlStates.length; i++) {
        const s = this.swirlStates[i]
        const local = this.t - s.birth
        if (local < 0) continue
        if (local >= s.life) {
          if (spawning) Object.assign(s, this.rollSwirl(Math.random() * 0.25))
          else this.swirl.hide(i)
          continue
        }
        const p = local / s.life
        const y = 0.1 + s.rise * local
        // 円錐面に沿う: メッシュの根本半径0.40 → 上端1.0 (高さ2.2)
        const r = (0.42 + y * 0.28) * (1.04 + 0.08 * Math.sin(local * 9 + i))
        const theta = s.theta + s.omega * local
        const env = Math.sin(Math.PI * Math.min(p * 1.5, 1)) * (0.75 + 0.25 * Math.sin(local * 22 + i * 2))
        this.swirl.set(i, Math.cos(theta) * r, y, Math.sin(theta) * r, s.color.r * env, s.color.g * env, s.color.b * env)
      }
      this.swirl.commit()
    }
  }
}
