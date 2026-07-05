import * as THREE from 'three'
import gsap from 'gsap'
import type { FxAssets } from '../assets'
import { FxMaterial, colorRamp } from '../fxmaterial'
import { FxManager, ParticleBurst } from '../particles'
import { MeshFx } from '../meshfx'
import { glowPop } from '../impact'
import { glowTexture } from '../textures'

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

    // 1. 外柱 / 2. 内柱（逆回転・速い上昇流）
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

    // 5. 収束パーティクル（召喚感）
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
