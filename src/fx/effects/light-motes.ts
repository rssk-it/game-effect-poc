import * as THREE from 'three'
import { FxManager, type Updatable } from '../particles'
import { ParticleField } from '../field'
import { glowTexture } from '../textures'

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

/** 光の粒1粒の浮遊パラメータ。 */
interface MoteState {
  origin: THREE.Vector3
  rise: number
  phase: number
  amp: number
  delay: number
  life: number
  color: THREE.Color
}

/**
 * 光の粒がふわっと立ちのぼる控えめなパーティクル。
 * 足元の円盤からスタッガー付きで湧き、ゆらぎながら上昇して溶けるように消える。
 * 勝利・回復・バフなどの穏やかな演出向け。
 */
export class LightMotes implements Updatable {
  private field: ParticleField
  private motes: MoteState[] = []
  private t = 0

  constructor(fx: FxManager, pos: THREE.Vector3, o: LightMotesOptions = {}) {
    const count = o.count ?? 26
    const radius = o.radius ?? 1.1
    const [lifeMin, lifeMax] = o.life ?? [1.5, 2.4]
    const stagger = o.stagger ?? 1.0
    const [riseMin, riseMax] = o.riseSpeed ?? [0.55, 1.05]
    const ca = new THREE.Color(o.colorA ?? 0xfff7d9)
    const cb = new THREE.Color(o.colorB ?? 0xffd27a)

    this.field = new ParticleField({
      count,
      texture: glowTexture(),
      size: o.size ?? 0.42,
      renderOrder: 6,
      parent: fx.scene,
    })

    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * radius
      this.motes.push({
        origin: new THREE.Vector3(
          pos.x + Math.cos(ang) * r,
          pos.y + 0.15 + Math.random() * 0.5,
          pos.z + Math.sin(ang) * r,
        ),
        rise: riseMin + Math.random() * (riseMax - riseMin),
        phase: Math.random() * Math.PI * 2,
        amp: 0.06 + Math.random() * 0.14,
        delay: Math.random() * stagger,
        life: lifeMin + Math.random() * (lifeMax - lifeMin),
        color: new THREE.Color().lerpColors(ca, cb, Math.random()),
      })
    }
    fx.add(this)
  }

  update(dt: number): boolean {
    this.t += dt

    let alive = false
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i]
      const local = this.t - m.delay
      if (local < 0) {
        alive = true
        continue
      }
      if (local >= m.life) {
        this.field.hide(i)
        continue
      }
      alive = true
      const p = local / m.life
      // ふわっと現れてすっと溶ける明滅エンベロープ + 微細なきらめき
      const env = Math.sin(Math.PI * Math.min(p * 1.6, 1)) * (1 - p * 0.35)
      const twinkle = 0.82 + 0.18 * Math.sin(local * 9 + m.phase)
      const sway = Math.sin(local * 2.2 + m.phase) * m.amp * p
      const b = env * twinkle
      this.field.set(
        i,
        m.origin.x + sway,
        m.origin.y + m.rise * local,
        m.origin.z + Math.cos(local * 1.8 + m.phase) * m.amp * p,
        m.color.r * b,
        m.color.g * b,
        m.color.b * b,
      )
    }
    this.field.commit()

    if (!alive) {
      this.field.dispose()
      return false
    }
    return true
  }
}
