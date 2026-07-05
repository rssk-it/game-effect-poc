import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxMaterial, colorRamp } from '../fxmaterial'
import { FxManager, ParticleBurst } from '../particles'
import { MeshFx } from '../meshfx'
import { glowPop } from '../impact'
import { sparkTexture } from '../textures'

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
