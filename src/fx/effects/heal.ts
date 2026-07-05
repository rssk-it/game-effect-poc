import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxMaterial } from '../fxmaterial'
import type { FxManager } from '../particles'
import { MeshFx } from '../meshfx'
import { ParticleField } from '../field'
import { glowPop } from '../impact'
import { starTexture } from '../textures'
import { LightMotes } from './light-motes'

export interface HealBloomOptions {
  scale?: number
  duration?: number
  color?: THREE.ColorRepresentation
  innerColor?: THREE.ColorRepresentation
}

/** きらめき1つ分の状態（その場で瞬く✨）。 */
interface SparkleState {
  pos: THREE.Vector3
  birth: number
  life: number
  drift: number
}

/**
 * 回復エフェクト。
 * 1. 王冠状メッシュが地面からせり上がって開く（+遅れてもう一段）
 * 2. 縦に走る筒状の光線が体の周りを立ちのぼる
 * 3. ✨のきらめきが体の周りで瞬く
 * 4. 緑の光の粒がふわっと立ちのぼる
 */
export class HealBloom extends MeshFx {
  private sparkles: ParticleField
  private sparkleStates: SparkleState[] = []
  private crowns: THREE.Mesh[] = []

  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: HealBloomOptions = {}) {
    super(fx)
    const { scale = 1.15, duration = 1.9, color = 0x6fe8a0, innerColor = 0xd8ffe8 } = o

    this.group.position.copy(pos)
    this.start()

    // 1. 王冠: 地面からせり上がって開く（本体 + 0.28秒遅れのエコー）
    for (let k = 0; k < 2; k++) {
      const crownMat = new FxMaterial({
        map: assets.tex.energyStream,
        color: k === 0 ? color : innerColor,
        edgeColor: 0xffffff,
        desaturate: 1,
        scroll: [0.05, -0.9],
        dissolveSoft: 0.25,
        fadeTop: 0.45,
        fadeBottom: 0.1,
        opacity: 0,
      })
      const crown = this.addMesh(assets.geo.healCrown, crownMat, 7)
      crown.scale.set(scale * 0.6, scale * 0.05, scale * 0.6)
      this.crowns.push(crown)

      gsap.delayedCall(k * 0.28, () => {
        crownMat.opacity2 = k === 0 ? 1 : 0.7
        gsap.to(crown.scale, { x: scale, z: scale, duration: 0.4, ease: 'power2.out' })
        gsap.to(crown.scale, { y: scale, duration: 0.35, ease: 'back.out(1.8)' })
        gsap.to(crown.position, { y: 0.35, duration: 0.9, ease: 'power1.out' })
        gsap.to(crownMat, { dissolve: 1, duration: 0.75, ease: 'power1.in', delay: 0.35 })
      })
    }

    // 2. 縦に走る筒状の光線（体の周囲の円周上に細い光の板を立てる）
    const streakCount = 9
    for (let i = 0; i < streakCount; i++) {
      const h = 1.6 + Math.random() * 0.9
      const streakMat = new FxMaterial({
        map: assets.tex.energyStream,
        color: Math.random() < 0.35 ? innerColor : color,
        desaturate: 1,
        scroll: [0, -2.4],
        repeat: [0.25, 1],
        dissolveSoft: 0.3,
        fadeTop: 0.4,
        fadeBottom: 0.25,
        opacity: 0,
      })
      const streak = this.addMesh(this.ownGeometry(new THREE.PlaneGeometry(0.09 + Math.random() * 0.08, h)), streakMat, 8)
      const ang = (i / streakCount) * Math.PI * 2 + Math.random() * 0.4
      const r = scale * (0.45 + Math.random() * 0.4)
      streak.position.set(Math.cos(ang) * r, 0.1, Math.sin(ang) * r)
      streak.rotation.y = -ang
      streak.scale.y = 0.05

      // 時間差で: すっと伸びる → 上へ流れながら消える
      gsap.delayedCall(0.08 + Math.random() * 0.6, () => {
        streakMat.opacity2 = 1
        gsap.to(streak.scale, { y: 1, duration: 0.22, ease: 'power3.out' })
        gsap.to(streak.position, { y: 0.1 + h * 0.55, duration: 0.85, ease: 'power1.out' })
        gsap.to(streakMat, { dissolve: 1, duration: 0.55, ease: 'power1.in', delay: 0.3 })
      })
    }

    // 3. ✨のきらめき（その場で瞬く4方向スター）
    this.sparkles = this.own(
      new ParticleField({
        count: 15,
        texture: starTexture(),
        size: 0.5,
        renderOrder: 9,
        parent: this.group,
      }),
    )
    for (let i = 0; i < this.sparkles.count; i++) {
      const ang = Math.random() * Math.PI * 2
      const r = scale * (0.3 + Math.random() * 0.75)
      this.sparkleStates.push({
        pos: new THREE.Vector3(Math.cos(ang) * r, 0.3 + Math.random() * 2.0, Math.sin(ang) * r),
        birth: Math.random() * (duration - 0.7),
        life: 0.4 + Math.random() * 0.35,
        drift: 0.15 + Math.random() * 0.3,
      })
    }

    // 4. 緑の光の粒
    new LightMotes(fx, pos, {
      count: 22,
      radius: scale * 0.9,
      colorA: innerColor,
      colorB: color,
      size: 0.34,
      riseSpeed: [0.45, 0.85],
      stagger: 1.0,
    })

    // 5. 足元の光だまり + 胸元の柔らかいグロー
    const baseGlow = this.addGlowSprite(color, 2.4 * scale, 0.8 * scale, 0.7)
    baseGlow.position.y = 0.15
    gsap.to(baseGlow.material, { opacity: 0, duration: 0.8, ease: 'power2.in', delay: duration - 0.9 })
    gsap.delayedCall(0.35, () => glowPop(fx.scene, pos.clone().add(new THREE.Vector3(0, 1.6, 0)), innerColor, 2.2 * scale, 0.55))

    gsap.delayedCall(duration, () => this.kill())
  }

  protected onUpdate(): void {
    // ✨は位置ほぼ固定でスッと現れてキュッと消える（sinエンベロープ + 微上昇）
    for (let i = 0; i < this.sparkleStates.length; i++) {
      const s = this.sparkleStates[i]
      const local = this.t - s.birth
      if (local < 0 || local >= s.life) {
        this.sparkles.hide(i)
        continue
      }
      const p = local / s.life
      const env = Math.sin(Math.PI * p) ** 0.7
      this.sparkles.set(i, s.pos.x, s.pos.y + local * s.drift, s.pos.z, env, env, env * 0.92)
    }
    this.sparkles.commit()
  }
}
