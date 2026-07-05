import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxMaterial, colorRamp } from '../fxmaterial'
import { FxManager, ParticleBurst } from '../particles'
import { MeshFx } from '../meshfx'
import { glowPop } from '../impact'
import { glowTexture } from '../textures'
import { LightMotes } from './light-motes'

export interface HolyPillarOptions {
  scale?: number
  duration?: number
  color?: THREE.ColorRepresentation
  innerColor?: THREE.ColorRepresentation
  /** 収束パーティクルを出すか */
  gather?: boolean
}

/**
 * ラッパ状メッシュ二重構造の召喚光柱。
 * カッと一瞬で立ち上り、減衰しながら消えた後、光の粒が余韻として立ちのぼる。
 */
export class HolyPillar extends MeshFx {
  private inner: THREE.Mesh
  private outer: THREE.Mesh
  private shafts: THREE.Mesh[] = []

  constructor(fx: FxManager, assets: FxAssets, pos: THREE.Vector3, o: HolyPillarOptions = {}) {
    super(fx)
    const { scale = 1.5, duration = 1.4, color = 0xffd98a, innerColor = 0xfff4d6, gather = true } = o

    // 1. 外柱 / 2. 内柱（強い上昇スクロールで「立ち上る」動きを出す）
    const outerMat = new FxMaterial({
      map: assets.tex.energyStream,
      color,
      edgeColor: 0xffe9b0,
      scroll: [0.06, -1.6],
      repeat: [1, 1],
      dissolveSoft: 0.2,
      fadeTop: 0.5,
      fadeBottom: 0.08,
    })
    const innerMat = new FxMaterial({
      map: assets.tex.energyStream,
      color: innerColor,
      edgeColor: 0xffffff,
      scroll: [-0.04, -2.2],
      repeat: [1.5, 1],
      dissolveSoft: 0.2,
      fadeTop: 0.45,
      fadeBottom: 0.06,
    })
    this.outer = this.addMesh(assets.geo.pillar, outerMat, 7)
    this.inner = this.addMesh(assets.geo.pillar, innerMat, 8)
    this.inner.scale.set(0.5, 1, 0.5)

    // 3. 内側で交差する2枚のライトシャフト
    const shaftMats: FxMaterial[] = []
    for (let i = 0; i < 2; i++) {
      const shaftMat = new FxMaterial({
        map: assets.tex.energyStream,
        color: innerColor,
        scroll: [0, -2.0 - i * 0.4],
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

    // 4. 足元の光だまり
    const baseGlow = this.addGlowSprite(color, 2.6, 0.9, 0.8)
    baseGlow.position.y = 0.2

    this.group.position.copy(pos)
    // 発生時は低く潰しておき、y方向へカッと伸ばす
    this.group.scale.set(scale * 0.03, scale * 0.15, scale * 0.03)
    this.start()

    glowPop(fx.scene, pos.clone().add(new THREE.Vector3(0, 0.4, 0)), color, 4 * scale, 0.35)
    colorRamp(outerMat, [0xffffff, color], 0.45)

    const allMats = [outerMat, innerMat, ...shaftMats]
    const tl = gsap.timeline({ onComplete: () => this.kill() })
    // カッと立ち上る: 高さ0.12秒 → 太さ0.2秒
    tl.to(this.group.scale, { y: scale, duration: 0.12, ease: 'power4.out' }, 0)
    tl.to(this.group.scale, { x: scale, z: scale, duration: 0.2, ease: 'power3.out' }, 0.02)
    // 立ち上り直後から減衰を始め、揺らめきの間を作らない
    tl.to(allMats, { dissolve: 1, duration: duration - 0.25, ease: 'power1.in' }, 0.25)
    tl.to(baseGlow.material, { opacity: 0, duration: duration - 0.3, ease: 'power2.in' }, 0.3)

    // 5. 余韻: 柱が細り始めた頃に小さな光の粒が立ちのぼる
    gsap.delayedCall(duration * 0.4, () => {
      new LightMotes(fx, pos, {
        count: 16,
        radius: 0.55 * scale,
        colorA: 0xffffff,
        colorB: color,
        size: 0.3,
        riseSpeed: [0.35, 0.75],
        life: [1.0, 1.8],
        stagger: 0.7,
      })
    })

    // 6. 収束パーティクル（召喚感）
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
