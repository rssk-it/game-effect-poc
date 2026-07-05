import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxManager, ParticleBurst } from '../particles'
import { MeshFx } from '../meshfx'
import { glowTexture, sparkTexture } from '../textures'

export interface RoarWaveOptions {
  scale?: number
  color?: THREE.ColorRepresentation
  duration?: number
}

/**
 * 咆哮の音波エフェクト。カメラ正対で多層に広がる。
 * 1. 中心の閃光
 * 2. 音波リング×3（放射ライン/炎リングのテクスチャを時間差で、逆回転させながら）
 * 3. 衝撃のスパーク
 * 4. 吹き飛ぶ突風の塵
 * 画面側の集中線・シェイク・FOVパンチと組み合わせて使う。
 */
export class RoarWave extends MeshFx {
  private rings: THREE.Sprite[] = []

  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: RoarWaveOptions = {}) {
    super(fx)
    const { scale = 8, color = 0xff5f4a, duration = 0.9 } = o

    this.group.position.copy(pos)
    this.start()

    // 1. 中心の閃光（口元の炸裂）
    const flash = this.addGlowSprite(0xffc0a8, scale * 0.1, scale * 0.1, 0.9)
    gsap.to(flash.scale, { x: scale * 0.36, y: scale * 0.36, duration: 0.26, ease: 'power3.out' })
    gsap.to(flash.material, { opacity: 0, duration: 0.28, ease: 'power2.in', delay: 0.04 })

    // 2. 音波リング×3: 暖色の放射ライン → 色付き炎リング → 色付き放射ライン、の時間差三段
    const ringDefs = [
      { tex: assets.tex.shockwaveRing, color: 0xffc9b0 as THREE.ColorRepresentation, delay: 0, s: 1.0, opacity: 0.9 },
      { tex: assets.tex.fireRing, color, delay: 0.09, s: 0.82, opacity: 0.9 },
      { tex: assets.tex.shockwaveRing, color, delay: 0.2, s: 0.6, opacity: 0.75 },
    ]
    for (const def of ringDefs) {
      const mat = this.ownMaterial(
        new THREE.SpriteMaterial({
          map: def.tex,
          color: def.color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          rotation: Math.random() * Math.PI * 2,
        }),
      )
      const ring = new THREE.Sprite(mat)
      ring.renderOrder = 7
      ring.scale.setScalar(scale * 0.12)
      this.group.add(ring)
      this.rings.push(ring)

      gsap.delayedCall(def.delay, () => {
        mat.opacity = def.opacity
        gsap.to(ring.scale, { x: scale * def.s, y: scale * def.s, duration: 0.55, ease: 'power3.out' })
        gsap.to(mat, { opacity: 0, duration: 0.48, ease: 'power1.in', delay: 0.1 })
      })
    }

    // 3. 衝撃のスパーク（全方位に弾ける）
    fx.add(
      new ParticleBurst(fx.scene, {
        texture: sparkTexture(),
        position: pos,
        count: 22,
        colorA: 0xffd8c0,
        colorB: color,
        size: 0.3,
        speed: [5, 11],
        drag: 3,
        life: [0.15, 0.4],
      }),
    )
    // 4. 突風の塵（横方向に薄く吹き飛ぶ）
    fx.add(
      new ParticleBurst(fx.scene, {
        texture: glowTexture(),
        position: pos,
        count: 14,
        colorA: color,
        colorB: 0x60302a,
        size: 0.7,
        speed: [3, 7],
        direction: new THREE.Vector3(0, -0.1, 0),
        spread: 0.92,
        gravity: 0.6,
        drag: 2.4,
        life: [0.3, 0.7],
      }),
    )

    gsap.delayedCall(duration + 0.3, () => this.kill())
    this.refreshWireframe() // group直下に手動追加したリングスプライトにも状態を反映
  }

  protected onUpdate(dt: number): void {
    // リングをそれぞれ逆方向に回して音波の「うねり」を出す
    for (let i = 0; i < this.rings.length; i++) {
      const mat = this.rings[i].material as THREE.SpriteMaterial
      mat.rotation += dt * (i % 2 === 0 ? 0.9 : -1.3)
    }
  }
}
